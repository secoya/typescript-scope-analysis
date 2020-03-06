import * as ts from 'typescript';

export type DeclaringNode =
	| ts.VariableDeclaration
	| ts.FunctionExpression
	| ts.FunctionDeclaration
	| ts.ClassDeclaration
	| ts.ClassExpression
	| ts.NamespaceImport
	| ts.CatchClause
	| ts.ImportSpecifier
	| ts.ImportClause
	| ts.ParameterDeclaration;

export interface ScopeBindingDeclaration {
	declaringNode: DeclaringNode;
	bindingScopeKind: ScopeKind;
	identifier: string;
	mutability: Mutability;
	references: ScopeReference[];
}

export enum Mutability {
	Mutable = 'Mutable',
	Immutable = 'Immutable',
}

export enum ScopeKind {
	LexicalScope = 'LexicalScope',
	FunctionScope = 'FunctionScope',
}

export class SourceFileScopesContainer {
	private readonly scopes: WeakMap<ts.Node, Scope>;

	public constructor(sourceFile: ts.SourceFile) {
		this.scopes = findScopes(sourceFile);
		assignReferences(this.scopes, sourceFile);
	}

	public getScopeForNode(node: ts.Node): Scope {
		const scope = this.scopes.get(node);
		if (scope == null) {
			throw new Error(
				'No scope could be found for node. Does the node belong to the source file this was created from?',
			);
		}

		return scope;
	}
}

export interface ScopeReference {
	identifier: ts.Identifier;
	referenceTo: {
		scope: Scope;
		binding: ScopeBindingDeclaration;
	} | null;
	referencedFromScope: Scope;
	writeExpr: ts.Expression | null;
	isInitializer: boolean;
}

export class Scope {
	public readonly scopeKind: ScopeKind;

	private readonly bindings: Map<string, ScopeBindingDeclaration>;
	private readonly parentScope: Scope | null;
	private readonly childScopes: Scope[];
	private readonly declaratingNode: ts.Node;

	private readonly references: ScopeReference[];

	public constructor(scopeKind: ScopeKind, declaratingNode: ts.Node, parentScope: Scope | null) {
		this.scopeKind = scopeKind;
		this.bindings = new Map();
		this.parentScope = parentScope;
		this.declaratingNode = declaratingNode;
		this.childScopes = [];
		this.references = [];
	}

	public dangerousMutateToPrintFriendlyScope(): void {
		this.bindings.forEach(binding => {
			(binding as any).declaringNode = null;
			(binding as any).references = null;
		});
		(this as any).declaratingNode = null;
		(this as any).childScopes = null;
		this.references.forEach(ref => {
			(ref as any).identifier = ref.identifier.text;
			if (ref.referenceTo != null) {
				(ref as any).referenceTo = {};
			}
			(ref as any).referencedFromScope = null;
			(ref as any).writeExpr = null;
		});
		this.parentScope != null && this.parentScope.dangerousMutateToPrintFriendlyScope();
	}

	public getReferences(): ReadonlyArray<ScopeReference> {
		return this.references;
	}

	public getBinding(name: string): [ScopeBindingDeclaration, Scope] | null {
		const decl = this.bindings.get(name);
		if (decl != null) {
			return [decl, this];
		}
		return this.parentScope == null ? null : this.parentScope.getBinding(name);
	}

	public hasBinding(name: string): boolean {
		return this.getBinding(name) != null;
	}

	public getParentScope(): Scope | null {
		return this.parentScope;
	}

	public getOwnLexicalBinding(name: string): ScopeBindingDeclaration | null {
		const decl = this.bindings.get(name);
		if (decl != null) {
			return decl;
		}
		return null;
	}

	public hasOwnLexicalBinding(name: string): boolean {
		return this.getOwnLexicalBinding(name) != null;
	}

	public getOwnFunctionScopeBinding(name: string): [ScopeBindingDeclaration, Scope] | null {
		const decl = this.bindings.get(name);
		if (decl != null) {
			return [decl, this];
		}
		if (this.scopeKind === ScopeKind.FunctionScope || this.parentScope == null) {
			return null;
		}
		return this.parentScope.getOwnFunctionScopeBinding(name);
	}

	public hasOwnFunctionScopeBinding(name: string): boolean {
		return this.getOwnFunctionScopeBinding(name) != null;
	}

	public newChildScope(scopeKind: ScopeKind, declaratingNode: ts.Node): Scope {
		const childScope = new Scope(scopeKind, declaratingNode, this);
		this.childScopes.push(childScope);
		return childScope;
	}

	public getDeclaringNode(): ts.Node {
		return this.declaratingNode;
	}

	public addBinding(name: string, declaration: ScopeBindingDeclaration) {
		if (declaration.bindingScopeKind === ScopeKind.LexicalScope) {
			this.bindings.set(name, declaration);
		} else {
			let scope: Scope | null = this;
			while (scope != null && scope.scopeKind !== ScopeKind.FunctionScope) {
				scope = scope.parentScope;
			}
			if (scope == null) {
				throw new Error('Could not find parent function scope');
			}
			scope.bindings.set(name, declaration);
		}
	}

	public addReference(node: ts.Identifier, writeExpr: ts.Expression | null, isInitializer: boolean): void {
		const binding = this.getBinding(node.text);
		const reference = {
			referenceTo:
				binding == null
					? null
					: {
							binding: binding[0],
							scope: binding[1],
					  },
			identifier: node,
			referencedFromScope: this,
			writeExpr: writeExpr,
			isInitializer: isInitializer,
		};
		if (binding != null) {
			binding[0].references.push(reference);
		}
		this.references.push(reference);
	}

	public getAllReferencesRecursively(): ReadonlyArray<ScopeReference> {
		return [
			...this.getReferences(),
			...Array.prototype.concat.apply(
				[],
				this.childScopes.map(s => s.getAllReferencesRecursively()),
			),
		];
	}

	public getChildScopes(): Scope[] {
		return this.childScopes;
	}
}

function findScopes(sourceFile: ts.SourceFile): WeakMap<ts.Node, Scope> {
	const result: WeakMap<ts.Node, Scope> = new WeakMap();
	const visitAllChildren = (node: ts.Node, scope: Scope) => {
		ts.forEachChild(node, child => visitNode(child, scope));
	};
	const addAllChildren = (node: ts.Node, scope: Scope) => {
		// Arrow function uses a statement form here to avoid forEachChild from returning early
		ts.forEachChild(node, child => {
			result.set(child, scope);
		});
	};

	const visitBindingName = (
		bindingName: ts.BindingName,
		decl: DeclaringNode,
		scope: Scope,
		scopeKind: ScopeKind,
		mutability: Mutability,
	): void => {
		if (ts.isIdentifier(bindingName)) {
			scope.addBinding(bindingName.text, {
				declaringNode: decl,
				bindingScopeKind: scopeKind,
				identifier: bindingName.text,
				mutability: mutability,
				references: [],
			});
		} else if (ts.isObjectBindingPattern(bindingName)) {
			bindingName.elements.forEach(el => visitBindingElement(el, decl, scope, scopeKind, mutability));
		} else if (ts.isArrayBindingPattern(bindingName)) {
			bindingName.elements.forEach(el => visitArrayBindingElement(el, decl, scope, scopeKind, mutability));
		}
	};
	const visitArrayBindingElement = (
		arrayBindingElement: ts.ArrayBindingElement,
		declaringNode: DeclaringNode,
		scope: Scope,
		scopeKind: ScopeKind,
		mutability: Mutability,
	): void => {
		if (ts.isBindingElement(arrayBindingElement)) {
			visitBindingElement(arrayBindingElement, declaringNode, scope, scopeKind, mutability);
		}
	};

	const visitBindingElement = (
		bindingElement: ts.BindingElement,
		declaringNode: DeclaringNode,
		scope: Scope,
		scopeKind: ScopeKind,
		mutability: Mutability,
	): void => {
		visitBindingName(bindingElement.name, declaringNode, scope, scopeKind, mutability);
	};

	const visitParameterDeclaration = (paramDecl: ts.ParameterDeclaration, scope: Scope): void => {
		// Ensure we get all the nodes added to the map
		visitNode(paramDecl, scope);
		if (ts.isIdentifier(paramDecl.name)) {
			scope.addBinding(paramDecl.name.text, {
				declaringNode: paramDecl,
				bindingScopeKind: ScopeKind.FunctionScope,
				identifier: paramDecl.name.text,
				mutability: Mutability.Mutable,
				references: [],
			});
		} else if (ts.isObjectBindingPattern(paramDecl.name)) {
			paramDecl.name.elements.forEach(el =>
				visitBindingElement(el, paramDecl, scope, ScopeKind.FunctionScope, Mutability.Mutable),
			);
		} else {
			paramDecl.name.elements.forEach(el =>
				visitArrayBindingElement(el, paramDecl, scope, ScopeKind.FunctionScope, Mutability.Mutable),
			);
		}
	};

	const visitFunctionLike = (functionLike: ts.FunctionLike, scope: Scope): void => {
		// Walk through every initial child - in a non resursive manner to add them to the result map
		// with a default scope. We then "hope" to override these with more specific scopes later
		addAllChildren(functionLike, scope);
		visitOptionalNodes(functionLike.typeParameters, scope);
		visitOptionalNode(functionLike.type, scope);
		if (functionLike.name != null) {
			result.set(functionLike.name, scope);
			addAllChildren(functionLike.name, scope);
			const name = functionLike.name;
			if (
				(ts.isFunctionDeclaration(functionLike) || ts.isFunctionExpression(functionLike)) &&
				ts.isIdentifier(name)
			) {
				// Add the function to the current scope
				scope.addBinding(name.text, {
					mutability: Mutability.Immutable, // Is this really immutable?
					bindingScopeKind: ScopeKind.LexicalScope,
					identifier: name.text,
					declaringNode: functionLike,
					references: [],
				});
			}
		}

		// Visit parameters under current scope, collecting bindings as we go
		const functionScope = scope.newChildScope(ScopeKind.FunctionScope, functionLike);
		functionLike.parameters.forEach(node => {
			visitParameterDeclaration(node, functionScope);
		});

		if (
			ts.isConstructorDeclaration(functionLike) ||
			ts.isMethodDeclaration(functionLike) ||
			ts.isFunctionDeclaration(functionLike) ||
			ts.isArrowFunction(functionLike) ||
			ts.isFunctionExpression(functionLike) ||
			ts.isGetAccessorDeclaration(functionLike) ||
			ts.isSetAccessorDeclaration(functionLike)
		) {
			if (functionLike.body == null) {
				return;
			}
			if (ts.isBlock(functionLike.body)) {
				result.set(functionLike.body, functionScope);
				return visitAllChildren(functionLike.body, functionScope);
			} else {
				return visitNode(functionLike.body, functionScope);
			}
		}

		return;
	};

	/**
	 * This recursives through the AST. We add the visited node to the current scope
	 * and then if there's no special handling we recurse through all children.
	 * All nodes in the AST should be added to the map
	 */
	const visitNode = (node: ts.Node, scope: Scope): void => {
		result.set(node, scope);
		if (ts.isBlock(node)) {
			// Create a new lexical scope when entering a block
			const blockScope = scope.newChildScope(ScopeKind.LexicalScope, node);
			if (ts.isCatchClause(node.parent) && node.parent.variableDeclaration != null) {
				visitBindingName(
					node.parent.variableDeclaration.name,
					node.parent,
					blockScope,
					ScopeKind.LexicalScope,
					Mutability.Mutable,
				);
			}
			return visitAllChildren(node, blockScope);
		}

		if (ts.isImportClause(node)) {
			if (node.name != null) {
				scope.addBinding(node.name.text, {
					mutability: Mutability.Immutable,
					declaringNode: node,
					identifier: node.name.text,
					bindingScopeKind: ScopeKind.FunctionScope,
					references: [],
				});
			}
			if (node.namedBindings != null) {
				if (ts.isNamespaceImport(node.namedBindings)) {
					scope.addBinding(node.namedBindings.name.text, {
						mutability: Mutability.Immutable,
						declaringNode: node.namedBindings,
						identifier: node.namedBindings.name.text,
						bindingScopeKind: ScopeKind.FunctionScope,
						references: [],
					});
				} else {
					node.namedBindings.elements.forEach(el => {
						scope.addBinding(el.name.text, {
							mutability: Mutability.Immutable,
							declaringNode: el,
							identifier: el.name.text,
							bindingScopeKind: ScopeKind.FunctionScope,
							references: [],
						});
					});
				}
			}
			return visitAllChildren(node, scope);
		}

		if (ts.isFunctionLike(node)) {
			return visitFunctionLike(node, scope);
		}

		if (ts.isClassLike(node)) {
			// Add the class to the containing scope
			if (node.name != null) {
				scope.addBinding(node.name.text, {
					mutability: Mutability.Immutable,
					identifier: node.name.text,
					declaringNode: node,
					bindingScopeKind: ScopeKind.FunctionScope,
					references: [],
				});
			}

			// Add this to the class scope
			const classScope = scope.newChildScope(ScopeKind.FunctionScope, node);
			classScope.addBinding('this', {
				mutability: Mutability.Immutable,
				identifier: 'this',
				declaringNode: node,
				bindingScopeKind: ScopeKind.FunctionScope,
				references: [],
			});
			return visitAllChildren(node, classScope);
		}

		if (ts.isForInStatement(node) || ts.isForOfStatement(node) || ts.isForStatement(node)) {
			// Add all immediate children to the result map - overriding their values later
			addAllChildren(node, scope);
			const forScope = scope.newChildScope(ScopeKind.LexicalScope, node);
			if (node.initializer != null) {
				visitNode(node.initializer, forScope);
			}
			if (ts.isForStatement(node)) {
				if (node.condition != null) {
					visitNode(node.condition, forScope);
				}
				if (node.incrementor != null) {
					visitNode(node.incrementor, forScope);
				}
			} else {
				visitNode(node.expression, scope);
			}
			if (ts.isBlock(node.statement)) {
				result.set(node.statement, forScope);
				return visitAllChildren(node.statement, forScope);
			} else {
				return visitNode(node.statement, forScope);
			}
		}

		if (ts.isVariableDeclaration(node)) {
			if (ts.isVariableDeclarationList(node.parent)) {
				const scopeKind =
					(node.parent.flags & ts.NodeFlags.BlockScoped) != 0
						? ScopeKind.LexicalScope
						: ScopeKind.FunctionScope;
				const mutability =
					(node.parent.flags & ts.NodeFlags.Const) != 0 ? Mutability.Immutable : Mutability.Mutable;

				visitBindingName(node.name, node, scope, scopeKind, mutability);
			}
		}
		return visitAllChildren(node, scope);
	};

	const visitOptionalNode = (node: ts.Node | undefined, scope: Scope): void => {
		if (node != null) {
			visitNode(node, scope);
		}
	};

	const visitOptionalNodes = (nodes: ts.NodeArray<ts.Node> | undefined, scope: Scope): void => {
		if (nodes == null) {
			return;
		}
		nodes.forEach(node => visitNode(node, scope));
	};

	visitNode(sourceFile, new Scope(ScopeKind.FunctionScope, sourceFile, null));

	return result;
}

function assignReferences(scopesMap: WeakMap<ts.Node, Scope>, sourceFile: ts.SourceFile): void {
	const getScope = (node: ts.Node): Scope => {
		const scope = scopesMap.get(node);
		if (scope == null) {
			throw new Error('Scope not found');
		}
		return scope;
	};

	const visitNode = (
		node: ts.Node | undefined | ts.NodeArray<ts.Node>,
		collectReferences: boolean,
		initializer?: ts.Expression,
	): void => {
		if (node == null) {
			return;
		}
		if (isNodeArray(node)) {
			node.forEach(n => visitNode(n, collectReferences));
			return;
		}
		if (ts.isTypeNode(node)) {
			return;
		}
		if (ts.isIdentifier(node) && collectReferences) {
			const scope = getScope(node);
			if (node.text == '') {
				return;
			}
			if (initializer == null) {
				scope.addReference(node, null, false);
			} else {
				scope.addReference(node, initializer, true);
			}
			return;
		}
		if (ts.isVariableDeclaration(node)) {
			if (node.initializer != null) {
				visitNode(node.initializer, true);
			}
			visitNode(node.name, true, node.initializer);
			return;
		}
		if (ts.isExpressionStatement(node)) {
			visitNode(node.expression, true);
			return;
		}
		if (ts.isBinaryExpression(node)) {
			if (node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
				// Variables on the left we don't count as references to the original value
				// perhaps we should do something to indicate that the value is reassigned?
				if (ts.isIdentifier(node.left)) {
					const scope = getScope(node);
					scope.addReference(node.left, node.right, false);
				} else {
					visitNode(node.left, true);
				}
				visitNode(node.right, true);
				return;
			}
		}
		if (ts.isReturnStatement(node)) {
			visitNode(node.expression, true);
			return;
		}
		if (ts.isThrowStatement(node)) {
			visitNode(node.expression, true);
			return;
		}
		if (ts.isPropertyAccessExpression(node)) {
			visitNode(node.expression, collectReferences);
			visitNode(node.name, false);
			return;
		}
		if (ts.isElementAccessExpression(node)) {
			visitNode(node.expression, collectReferences);
			visitNode(node.argumentExpression, true);
			return;
		}
		if (ts.isCallExpression(node)) {
			visitNode(node.expression, true);
			visitNode(node.arguments, true);
			return;
		}
		if (ts.isArrowFunction(node)) {
			visitNode(node.parameters, false);
			visitNode(node.body, !ts.isBlock(node.body));
			return;
		}
		// We don't ever collect references for non-arrow function declarations (this might be a bad idea, but we'll see)
		if (ts.isFunctionLike(node) && collectReferences) {
			visitNode(node, false);
			return;
		}

		if (ts.isParameter(node)) {
			visitNode(node.name, false);
			visitNode(node.initializer, true);
			return;
		}

		if (ts.isIfStatement(node)) {
			visitNode(node.expression, true);
			visitNode(node.thenStatement, false);
			visitNode(node.elseStatement, false);
			return;
		}

		if (ts.isForInStatement(node) || ts.isForOfStatement(node)) {
			visitNode(node.expression, true);
			visitNode(node.initializer, true, node.expression);
			visitNode(node.statement, false);
			return;
		}
		if (ts.isForStatement(node)) {
			visitNode(node.initializer, true);
			visitNode(node.condition, true);
			visitNode(node.incrementor, true);
			visitNode(node.statement, false);
			return;
		}
		if (ts.isWhileStatement(node)) {
			visitNode(node.expression, true);
			visitNode(node.statement, false);
			return;
		}

		if (ts.isSwitchStatement(node)) {
			visitNode(node.expression, true);
			visitNode(node.caseBlock, false);
			return;
		}

		if (ts.isCaseClause(node)) {
			visitNode(node.expression, true);
			visitNode(node.statements, false);
			return;
		}

		if (ts.isJsxOpeningElement(node)) {
			visitNode(node.tagName, true);
			visitNode(node.attributes, false);
			return;
		}
		if (ts.isJsxClosingElement(node)) {
			visitNode(node.tagName, true);
			return;
		}
		if (ts.isJsxSelfClosingElement(node)) {
			visitNode(node.tagName, true);
			visitNode(node.attributes, false);
			return;
		}
		if (ts.isJsxExpression(node)) {
			visitNode(node.expression, true);
			return;
		}
		if (ts.isJsxAttribute(node)) {
			visitNode(node.name, false);
			visitNode(node.initializer, true);
			return;
		}
		if (ts.isJsxSpreadAttribute(node)) {
			visitNode(node.expression, true);
			return;
		}

		if (ts.isPropertyAssignment(node)) {
			visitNode(node.name, false);
			visitNode(node.initializer, true);
			return;
		}

		if (ts.isComputedPropertyName(node)) {
			visitNode(node.expression, true);
			return;
		}
		ts.forEachChild(node, child => visitNode(child, collectReferences));
	};

	visitNode(sourceFile, false);
}

function isNodeArray(node: any): node is ts.NodeArray<ts.Node> {
	return Array.isArray(node);
}
