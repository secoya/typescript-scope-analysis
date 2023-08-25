import { SourceFileScopesContainer, Scope } from '../';
import * as ts from 'typescript';

function allNodesDefined(node: ts.Node, scopesContainer: SourceFileScopesContainer): void {
	try {
		scopesContainer.getScopeForNode(node);
	} catch (e) {
		failAtNode(node, 'No scope found for node');
	}
	ts.forEachChild(node, (child) => allNodesDefined(child, scopesContainer));
}

function failAtNode(node: ts.Node, msg: string): never {
	const sourceFile = node.getSourceFile();
	const sourceFileText = sourceFile.text;
	const nodePos = node.pos;
	const { line, character } = ts.getLineAndCharacterOfPosition(sourceFile, nodePos);
	const lines = sourceFileText.split(/\n/g);
	const nodeKind = ts.SyntaxKind[node.kind];
	const allText = [msg, 'Node is of kind: ' + nodeKind, ''];

	for (let i = 0; i < lines.length; i++) {
		allText.push(lines[i]);
		if (i === line) {
			allText.push(' '.repeat(character + 1) + '^');
		}
	}

	return fail(allText.join('\n'));
}

function getScopeForNode(node: ts.Node): Scope {
	const sourceFile = node.getSourceFile();
	const scopesContainer = new SourceFileScopesContainer(sourceFile);

	allNodesDefined(sourceFile, scopesContainer);

	const scope = scopesContainer.getScopeForNode(node);

	return scope;
}

function parseText(text: string): ts.SourceFile {
	return ts.createSourceFile('test.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function findScopeNode(sourceFile: ts.SourceFile, functionName: string): ts.Node {
	const visitNode = (node: ts.Node): ts.Node | undefined => {
		if (
			ts.isFunctionLike(node) &&
			node.name != null &&
			ts.isIdentifier(node.name) &&
			node.name.text === functionName
		) {
			if ((node as ts.FunctionLikeDeclaration).body != null) {
				return (node as ts.FunctionLikeDeclaration).body;
			}
			return node;
		}
		return ts.forEachChild(node, visitNode);
	};
	const result = ts.forEachChild(sourceFile, visitNode);
	if (result == null) {
		throw new Error('Could not find scope');
	}
	return result;
}

describe('Simple tests', () => {
	it('Can work correctly with object literals and references', () => {
		const sourceFile = parseText(`
			const x: typeof z = {
				id: 'value',
				scrollTop: y as typeof z,
			};
		`);
		const scope = getScopeForNode(sourceFile);

		scope.dangerousMutateToPrintFriendlyScope();
		expect(scope).toMatchInlineSnapshot(`
		Scope {
		  "bindings": Map {
		    "x" => {
		      "bindingScopeKind": "LexicalScope",
		      "declaringNode": null,
		      "identifier": "x",
		      "mutability": "Immutable",
		      "references": null,
		    },
		  },
		  "childScopes": null,
		  "declaringNode": null,
		  "parentScope": null,
		  "references": [
		    {
		      "identifier": "y",
		      "isInitializer": false,
		      "referenceTo": null,
		      "referencedFromScope": null,
		      "writeExpr": null,
		    },
		    {
		      "identifier": "x",
		      "isInitializer": true,
		      "referenceTo": {},
		      "referencedFromScope": null,
		      "writeExpr": null,
		    },
		  ],
		  "scopeKind": "FunctionScope",
		}
	`);
	});
	it('Can work correctly with JSX expressions', () => {
		const sourceFile = parseText(`
			const x = <MyXMLElement property={value} {...values} />;

			const y = <>
				<MyOtherElement property2={value2} {...values2}>
					Text
					{var}
				</MyOtherElement>
			</>;
		`);

		const scope = getScopeForNode(sourceFile);

		scope.dangerousMutateToPrintFriendlyScope();
		expect(scope).toMatchInlineSnapshot(`
		Scope {
		  "bindings": Map {
		    "x" => {
		      "bindingScopeKind": "LexicalScope",
		      "declaringNode": null,
		      "identifier": "x",
		      "mutability": "Immutable",
		      "references": null,
		    },
		    "y" => {
		      "bindingScopeKind": "LexicalScope",
		      "declaringNode": null,
		      "identifier": "y",
		      "mutability": "Immutable",
		      "references": null,
		    },
		  },
		  "childScopes": null,
		  "declaringNode": null,
		  "parentScope": null,
		  "references": [
		    {
		      "identifier": "MyXMLElement",
		      "isInitializer": false,
		      "referenceTo": null,
		      "referencedFromScope": null,
		      "writeExpr": null,
		    },
		    {
		      "identifier": "value",
		      "isInitializer": false,
		      "referenceTo": null,
		      "referencedFromScope": null,
		      "writeExpr": null,
		    },
		    {
		      "identifier": "values",
		      "isInitializer": false,
		      "referenceTo": null,
		      "referencedFromScope": null,
		      "writeExpr": null,
		    },
		    {
		      "identifier": "x",
		      "isInitializer": true,
		      "referenceTo": {},
		      "referencedFromScope": null,
		      "writeExpr": null,
		    },
		    {
		      "identifier": "MyOtherElement",
		      "isInitializer": false,
		      "referenceTo": null,
		      "referencedFromScope": null,
		      "writeExpr": null,
		    },
		    {
		      "identifier": "value2",
		      "isInitializer": false,
		      "referenceTo": null,
		      "referencedFromScope": null,
		      "writeExpr": null,
		    },
		    {
		      "identifier": "values2",
		      "isInitializer": false,
		      "referenceTo": null,
		      "referencedFromScope": null,
		      "writeExpr": null,
		    },
		    {
		      "identifier": "MyOtherElement",
		      "isInitializer": false,
		      "referenceTo": null,
		      "referencedFromScope": null,
		      "writeExpr": null,
		    },
		    {
		      "identifier": "y",
		      "isInitializer": true,
		      "referenceTo": {},
		      "referencedFromScope": null,
		      "writeExpr": null,
		    },
		  ],
		  "scopeKind": "FunctionScope",
		}
	`);
	});
	it('Understands various references', () => {
		const sourceFile = parseText(`function Counter({ increment }) {
			let [count, setCount] = useState(0);

			useEffect(() => {
				let id = setInterval(() => {
					function X() {}
					setCount(count => count + increment);
				}, 1000);
				return () => clearInterval(id);
			}, []);
		}`);

		const functionScope = getScopeForNode(findScopeNode(sourceFile, 'X')).getParentScope();
		if (functionScope == null) {
			throw new Error('No scope');
		}
		functionScope.dangerousMutateToPrintFriendlyScope();
		expect(functionScope).toMatchInlineSnapshot(`
		Scope {
		  "bindings": Map {
		    "X" => {
		      "bindingScopeKind": "LexicalScope",
		      "declaringNode": null,
		      "identifier": "X",
		      "mutability": "Immutable",
		      "references": null,
		    },
		  },
		  "childScopes": null,
		  "declaringNode": null,
		  "parentScope": Scope {
		    "bindings": Map {
		      "id" => {
		        "bindingScopeKind": "LexicalScope",
		        "declaringNode": null,
		        "identifier": "id",
		        "mutability": "Mutable",
		        "references": null,
		      },
		    },
		    "childScopes": null,
		    "declaringNode": null,
		    "parentScope": Scope {
		      "bindings": Map {
		        "increment" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "increment",
		          "mutability": "Mutable",
		          "references": null,
		        },
		        "count" => {
		          "bindingScopeKind": "LexicalScope",
		          "declaringNode": null,
		          "identifier": "count",
		          "mutability": "Mutable",
		          "references": null,
		        },
		        "setCount" => {
		          "bindingScopeKind": "LexicalScope",
		          "declaringNode": null,
		          "identifier": "setCount",
		          "mutability": "Mutable",
		          "references": null,
		        },
		      },
		      "childScopes": null,
		      "declaringNode": null,
		      "parentScope": Scope {
		        "bindings": Map {
		          "Counter" => {
		            "bindingScopeKind": "LexicalScope",
		            "declaringNode": null,
		            "identifier": "Counter",
		            "mutability": "Immutable",
		            "references": null,
		          },
		        },
		        "childScopes": null,
		        "declaringNode": null,
		        "parentScope": null,
		        "references": [],
		        "scopeKind": "FunctionScope",
		      },
		      "references": [
		        {
		          "identifier": "useState",
		          "isInitializer": false,
		          "referenceTo": null,
		          "referencedFromScope": null,
		          "writeExpr": null,
		        },
		        {
		          "identifier": "count",
		          "isInitializer": false,
		          "referenceTo": {},
		          "referencedFromScope": null,
		          "writeExpr": null,
		        },
		        {
		          "identifier": "setCount",
		          "isInitializer": false,
		          "referenceTo": {},
		          "referencedFromScope": null,
		          "writeExpr": null,
		        },
		        {
		          "identifier": "useEffect",
		          "isInitializer": false,
		          "referenceTo": null,
		          "referencedFromScope": null,
		          "writeExpr": null,
		        },
		      ],
		      "scopeKind": "FunctionScope",
		    },
		    "references": [
		      {
		        "identifier": "setInterval",
		        "isInitializer": false,
		        "referenceTo": null,
		        "referencedFromScope": null,
		        "writeExpr": null,
		      },
		      {
		        "identifier": "id",
		        "isInitializer": true,
		        "referenceTo": {},
		        "referencedFromScope": null,
		        "writeExpr": null,
		      },
		    ],
		    "scopeKind": "FunctionScope",
		  },
		  "references": [
		    {
		      "identifier": "setCount",
		      "isInitializer": false,
		      "referenceTo": {},
		      "referencedFromScope": null,
		      "writeExpr": null,
		    },
		  ],
		  "scopeKind": "FunctionScope",
		}
	`);
	});
	it('Gathers references correct', () => {
		const sourceFile = parseText(`function Example({ prop }) {
			const foo = useCallback(() => {
				if (prop) {
						foo();
				}
				function testFunction() {}
			}, [prop]);
		}
		`);

		const functionScope = getScopeForNode(findScopeNode(sourceFile, 'testFunction')).getParentScope();
		if (functionScope == null) {
			throw new Error('No scope');
		}
		functionScope.dangerousMutateToPrintFriendlyScope();
		expect(functionScope).toMatchInlineSnapshot(`
		Scope {
		  "bindings": Map {
		    "testFunction" => {
		      "bindingScopeKind": "LexicalScope",
		      "declaringNode": null,
		      "identifier": "testFunction",
		      "mutability": "Immutable",
		      "references": null,
		    },
		  },
		  "childScopes": null,
		  "declaringNode": null,
		  "parentScope": Scope {
		    "bindings": Map {
		      "prop" => {
		        "bindingScopeKind": "FunctionScope",
		        "declaringNode": null,
		        "identifier": "prop",
		        "mutability": "Mutable",
		        "references": null,
		      },
		      "foo" => {
		        "bindingScopeKind": "LexicalScope",
		        "declaringNode": null,
		        "identifier": "foo",
		        "mutability": "Immutable",
		        "references": null,
		      },
		    },
		    "childScopes": null,
		    "declaringNode": null,
		    "parentScope": Scope {
		      "bindings": Map {
		        "Example" => {
		          "bindingScopeKind": "LexicalScope",
		          "declaringNode": null,
		          "identifier": "Example",
		          "mutability": "Immutable",
		          "references": null,
		        },
		      },
		      "childScopes": null,
		      "declaringNode": null,
		      "parentScope": null,
		      "references": [],
		      "scopeKind": "FunctionScope",
		    },
		    "references": [
		      {
		        "identifier": "useCallback",
		        "isInitializer": false,
		        "referenceTo": null,
		        "referencedFromScope": null,
		        "writeExpr": null,
		      },
		      {
		        "identifier": "prop",
		        "isInitializer": false,
		        "referenceTo": {},
		        "referencedFromScope": null,
		        "writeExpr": null,
		      },
		      {
		        "identifier": "foo",
		        "isInitializer": true,
		        "referenceTo": {},
		        "referencedFromScope": null,
		        "writeExpr": null,
		      },
		    ],
		    "scopeKind": "FunctionScope",
		  },
		  "references": [
		    {
		      "identifier": "prop",
		      "isInitializer": false,
		      "referenceTo": {},
		      "referencedFromScope": null,
		      "writeExpr": null,
		    },
		  ],
		  "scopeKind": "FunctionScope",
		}
	`);
	});
	it('Should have simple function scope working', () => {
		const sourceFile = parseText(`const [x, z] = [1,2]; function myFunction({y, hans: [x]}) {
			return x + y;
		}`);

		const functionScope = getScopeForNode(findScopeNode(sourceFile, 'myFunction'));
		functionScope.dangerousMutateToPrintFriendlyScope();
		expect(functionScope).toMatchInlineSnapshot(`
		Scope {
		  "bindings": Map {
		    "y" => {
		      "bindingScopeKind": "FunctionScope",
		      "declaringNode": null,
		      "identifier": "y",
		      "mutability": "Mutable",
		      "references": null,
		    },
		    "x" => {
		      "bindingScopeKind": "FunctionScope",
		      "declaringNode": null,
		      "identifier": "x",
		      "mutability": "Mutable",
		      "references": null,
		    },
		  },
		  "childScopes": null,
		  "declaringNode": null,
		  "parentScope": Scope {
		    "bindings": Map {
		      "x" => {
		        "bindingScopeKind": "LexicalScope",
		        "declaringNode": null,
		        "identifier": "x",
		        "mutability": "Immutable",
		        "references": null,
		      },
		      "z" => {
		        "bindingScopeKind": "LexicalScope",
		        "declaringNode": null,
		        "identifier": "z",
		        "mutability": "Immutable",
		        "references": null,
		      },
		      "myFunction" => {
		        "bindingScopeKind": "LexicalScope",
		        "declaringNode": null,
		        "identifier": "myFunction",
		        "mutability": "Immutable",
		        "references": null,
		      },
		    },
		    "childScopes": null,
		    "declaringNode": null,
		    "parentScope": null,
		    "references": [
		      {
		        "identifier": "x",
		        "isInitializer": false,
		        "referenceTo": {},
		        "referencedFromScope": null,
		        "writeExpr": null,
		      },
		      {
		        "identifier": "z",
		        "isInitializer": false,
		        "referenceTo": {},
		        "referencedFromScope": null,
		        "writeExpr": null,
		      },
		    ],
		    "scopeKind": "FunctionScope",
		  },
		  "references": [
		    {
		      "identifier": "x",
		      "isInitializer": false,
		      "referenceTo": {},
		      "referencedFromScope": null,
		      "writeExpr": null,
		    },
		    {
		      "identifier": "y",
		      "isInitializer": false,
		      "referenceTo": {},
		      "referencedFromScope": null,
		      "writeExpr": null,
		    },
		  ],
		  "scopeKind": "FunctionScope",
		}
	`);
	});

	it('Should add this to a class scope', () => {
		const sourceFile = parseText(`class MyClass { myMemberFunction([y], ...args) { }}`);

		const functionScope = getScopeForNode(findScopeNode(sourceFile, 'myMemberFunction'));
		functionScope.dangerousMutateToPrintFriendlyScope();
		expect(functionScope).toMatchInlineSnapshot(`
		Scope {
		  "bindings": Map {
		    "y" => {
		      "bindingScopeKind": "FunctionScope",
		      "declaringNode": null,
		      "identifier": "y",
		      "mutability": "Mutable",
		      "references": null,
		    },
		    "args" => {
		      "bindingScopeKind": "FunctionScope",
		      "declaringNode": null,
		      "identifier": "args",
		      "mutability": "Mutable",
		      "references": null,
		    },
		  },
		  "childScopes": null,
		  "declaringNode": null,
		  "parentScope": Scope {
		    "bindings": Map {
		      "this" => {
		        "bindingScopeKind": "FunctionScope",
		        "declaringNode": null,
		        "identifier": "this",
		        "mutability": "Immutable",
		        "references": null,
		      },
		    },
		    "childScopes": null,
		    "declaringNode": null,
		    "parentScope": Scope {
		      "bindings": Map {
		        "MyClass" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "MyClass",
		          "mutability": "Immutable",
		          "references": null,
		        },
		      },
		      "childScopes": null,
		      "declaringNode": null,
		      "parentScope": null,
		      "references": [],
		      "scopeKind": "FunctionScope",
		    },
		    "references": [],
		    "scopeKind": "FunctionScope",
		  },
		  "references": [],
		  "scopeKind": "FunctionScope",
		}
	`);
	});

	it('Understands for loops', () => {
		const sourceFile = parseText(`for(let i = 0;;) {
			function myFunction() {}
		}`);

		const functionScope = getScopeForNode(findScopeNode(sourceFile, 'myFunction'));
		functionScope.dangerousMutateToPrintFriendlyScope();
		expect(functionScope).toMatchInlineSnapshot(`
		Scope {
		  "bindings": Map {},
		  "childScopes": null,
		  "declaringNode": null,
		  "parentScope": Scope {
		    "bindings": Map {
		      "i" => {
		        "bindingScopeKind": "LexicalScope",
		        "declaringNode": null,
		        "identifier": "i",
		        "mutability": "Mutable",
		        "references": null,
		      },
		      "myFunction" => {
		        "bindingScopeKind": "LexicalScope",
		        "declaringNode": null,
		        "identifier": "myFunction",
		        "mutability": "Immutable",
		        "references": null,
		      },
		    },
		    "childScopes": null,
		    "declaringNode": null,
		    "parentScope": Scope {
		      "bindings": Map {},
		      "childScopes": null,
		      "declaringNode": null,
		      "parentScope": null,
		      "references": [],
		      "scopeKind": "FunctionScope",
		    },
		    "references": [
		      {
		        "identifier": "i",
		        "isInitializer": true,
		        "referenceTo": {},
		        "referencedFromScope": null,
		        "writeExpr": null,
		      },
		    ],
		    "scopeKind": "LexicalScope",
		  },
		  "references": [],
		  "scopeKind": "FunctionScope",
		}
	`);
	});

	it('Understands for in loops', () => {
		const sourceFile = parseText(`for(let i in y) {
			function myFunction() {}
		}`);

		const functionScope = getScopeForNode(findScopeNode(sourceFile, 'myFunction'));
		functionScope.dangerousMutateToPrintFriendlyScope();
		expect(functionScope).toMatchInlineSnapshot(`
		Scope {
		  "bindings": Map {},
		  "childScopes": null,
		  "declaringNode": null,
		  "parentScope": Scope {
		    "bindings": Map {
		      "i" => {
		        "bindingScopeKind": "LexicalScope",
		        "declaringNode": null,
		        "identifier": "i",
		        "mutability": "Mutable",
		        "references": null,
		      },
		      "myFunction" => {
		        "bindingScopeKind": "LexicalScope",
		        "declaringNode": null,
		        "identifier": "myFunction",
		        "mutability": "Immutable",
		        "references": null,
		      },
		    },
		    "childScopes": null,
		    "declaringNode": null,
		    "parentScope": Scope {
		      "bindings": Map {},
		      "childScopes": null,
		      "declaringNode": null,
		      "parentScope": null,
		      "references": [
		        {
		          "identifier": "y",
		          "isInitializer": false,
		          "referenceTo": null,
		          "referencedFromScope": null,
		          "writeExpr": null,
		        },
		      ],
		      "scopeKind": "FunctionScope",
		    },
		    "references": [
		      {
		        "identifier": "i",
		        "isInitializer": false,
		        "referenceTo": {},
		        "referencedFromScope": null,
		        "writeExpr": null,
		      },
		    ],
		    "scopeKind": "LexicalScope",
		  },
		  "references": [],
		  "scopeKind": "FunctionScope",
		}
	`);
	});

	it('Understands for of loops', () => {
		const sourceFile = parseText(`for(let i of y) {
			function myFunction() {}
		}`);

		const functionScope = getScopeForNode(findScopeNode(sourceFile, 'myFunction'));
		functionScope.dangerousMutateToPrintFriendlyScope();
		expect(functionScope).toMatchInlineSnapshot(`
		Scope {
		  "bindings": Map {},
		  "childScopes": null,
		  "declaringNode": null,
		  "parentScope": Scope {
		    "bindings": Map {
		      "i" => {
		        "bindingScopeKind": "LexicalScope",
		        "declaringNode": null,
		        "identifier": "i",
		        "mutability": "Mutable",
		        "references": null,
		      },
		      "myFunction" => {
		        "bindingScopeKind": "LexicalScope",
		        "declaringNode": null,
		        "identifier": "myFunction",
		        "mutability": "Immutable",
		        "references": null,
		      },
		    },
		    "childScopes": null,
		    "declaringNode": null,
		    "parentScope": Scope {
		      "bindings": Map {},
		      "childScopes": null,
		      "declaringNode": null,
		      "parentScope": null,
		      "references": [
		        {
		          "identifier": "y",
		          "isInitializer": false,
		          "referenceTo": null,
		          "referencedFromScope": null,
		          "writeExpr": null,
		        },
		      ],
		      "scopeKind": "FunctionScope",
		    },
		    "references": [
		      {
		        "identifier": "i",
		        "isInitializer": false,
		        "referenceTo": {},
		        "referencedFromScope": null,
		        "writeExpr": null,
		      },
		    ],
		    "scopeKind": "LexicalScope",
		  },
		  "references": [],
		  "scopeKind": "FunctionScope",
		}
	`);
	});

	it('Understands named exports', () => {
		const sourceFile = parseText(`export const x = 5;`);

		const scope = getScopeForNode(sourceFile);
		scope.dangerousMutateToPrintFriendlyScope();
		expect(scope).toMatchInlineSnapshot(`
		Scope {
		  "bindings": Map {
		    "x" => {
		      "bindingScopeKind": "LexicalScope",
		      "declaringNode": null,
		      "identifier": "x",
		      "mutability": "Immutable",
		      "references": null,
		    },
		  },
		  "childScopes": null,
		  "declaringNode": null,
		  "parentScope": null,
		  "references": [
		    {
		      "identifier": "x",
		      "isInitializer": true,
		      "referenceTo": {},
		      "referencedFromScope": null,
		      "writeExpr": null,
		    },
		  ],
		  "scopeKind": "FunctionScope",
		}
	`);
	});

	it('Understands function scoped variables', () => {
		const sourceFile = parseText(`{var i = 0; function myFunction() {}}`);

		const scope = getScopeForNode(findScopeNode(sourceFile, 'myFunction'));
		scope.dangerousMutateToPrintFriendlyScope();
		expect(scope).toMatchInlineSnapshot(`
		Scope {
		  "bindings": Map {},
		  "childScopes": null,
		  "declaringNode": null,
		  "parentScope": Scope {
		    "bindings": Map {
		      "myFunction" => {
		        "bindingScopeKind": "LexicalScope",
		        "declaringNode": null,
		        "identifier": "myFunction",
		        "mutability": "Immutable",
		        "references": null,
		      },
		    },
		    "childScopes": null,
		    "declaringNode": null,
		    "parentScope": Scope {
		      "bindings": Map {
		        "i" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "i",
		          "mutability": "Mutable",
		          "references": null,
		        },
		      },
		      "childScopes": null,
		      "declaringNode": null,
		      "parentScope": null,
		      "references": [],
		      "scopeKind": "FunctionScope",
		    },
		    "references": [
		      {
		        "identifier": "i",
		        "isInitializer": true,
		        "referenceTo": {},
		        "referencedFromScope": null,
		        "writeExpr": null,
		      },
		    ],
		    "scopeKind": "LexicalScope",
		  },
		  "references": [],
		  "scopeKind": "FunctionScope",
		}
	`);
	});

	it('Understands imports', () => {
		const sourceFile = parseText(`import * as ts from 'typescript';
		import peter from 'hans';
		import { yolo, hans as swagger } from './hans';`);

		const scope = getScopeForNode(sourceFile);
		scope.dangerousMutateToPrintFriendlyScope();
		expect(scope).toMatchInlineSnapshot(`
		Scope {
		  "bindings": Map {
		    "ts" => {
		      "bindingScopeKind": "FunctionScope",
		      "declaringNode": null,
		      "identifier": "ts",
		      "mutability": "Immutable",
		      "references": null,
		    },
		    "peter" => {
		      "bindingScopeKind": "FunctionScope",
		      "declaringNode": null,
		      "identifier": "peter",
		      "mutability": "Immutable",
		      "references": null,
		    },
		    "yolo" => {
		      "bindingScopeKind": "FunctionScope",
		      "declaringNode": null,
		      "identifier": "yolo",
		      "mutability": "Immutable",
		      "references": null,
		    },
		    "swagger" => {
		      "bindingScopeKind": "FunctionScope",
		      "declaringNode": null,
		      "identifier": "swagger",
		      "mutability": "Immutable",
		      "references": null,
		    },
		  },
		  "childScopes": null,
		  "declaringNode": null,
		  "parentScope": null,
		  "references": [],
		  "scopeKind": "FunctionScope",
		}
	`);
	});

	it('Parses random Orbit file', () => {
		const code = `
		import { MutationManagerFetchNamedEntity } from 'com!fileexplorer%relay/components/mutation-manager-fetch-entity';
		import { WebKitDirectoryEntry, WebKitEntry, WebKitFileEntry } from 'com!fileexplorer%relay/helpers/webkit-dom-types';
		import {
			makeActionHandler,
			ActionHandler,
			ActionHandlerData,
			FileChangedData,
			FileChangedKind,
		} from 'com!fileexplorer%relay/mutation-management/action-handler';
		import { CreateDirectoryAction } from 'com!fileexplorer%relay/mutation-management/actions/create-directory';
		import { DeleteDirectoryAction } from 'com!fileexplorer%relay/mutation-management/actions/delete-directory';
		import { DeleteFileAction, DeleteFileData } from 'com!fileexplorer%relay/mutation-management/actions/delete-file';
		import {
			MoveDirectoryAction,
			MoveDirectoryData,
		} from 'com!fileexplorer%relay/mutation-management/actions/move-directory';
		import { MoveFileAction, MoveFileData } from 'com!fileexplorer%relay/mutation-management/actions/move-file';
		import { RenameDirectoryAction } from 'com!fileexplorer%relay/mutation-management/actions/rename-directory';
		import { RenameFileAction } from 'com!fileexplorer%relay/mutation-management/actions/rename-file';
		import { UploadDirectoryAction } from 'com!fileexplorer%relay/mutation-management/actions/upload-directory';
		import { UploadFileAction, UploadFileData } from 'com!fileexplorer%relay/mutation-management/actions/upload-file';
		import { ConflictInfo } from 'com!fileexplorer%relay/mutation-management/conflicts';
		import { IDBasedEventEmitter } from 'com!fileexplorer%relay/mutation-management/id-based-event-emitter';
		import { JobInfo } from 'com!fileexplorer%relay/mutation-management/job-info';
		import { MultiQueue } from 'com!fileexplorer%relay/mutation-management/queue';
		import {
			BrowsableFileInfo,
			DirectoryInfo,
			RecordStoreHelper,
		} from 'com!fileexplorer%relay/mutation-management/record-store-helper';
		import * as Notifications from 'com!notification';
		import { DirectoryContentOrdering } from 'graphql-schema';
		import * as Relay from 'react-relay/classic';
		import { Signal } from 'signals';

		const MANAGER_DISPOSED_ERROR = new Error('Disposed');

		type ConflictHandler = (conflicts: ConflictInfo[], canContinueWork: () => void) => void;

		const notes = Notifications.Manager.scope('files');

		interface FetchInfoDirectory {
			directoryId: string;
			entityType: 'Directory';
			name: string;
			reject: (err: any) => void;
			resolve: (info: string | null) => void;
		}

		interface FetchInfoBrowsableFile {
			directoryId: string;
			entityType: 'BrowsableFile';
			name: string;
			reject: (err: any) => void;
			resolve: (info: string | null) => void;
		}

		const SECOND = 1000;

		export type MutationManagerFetchInfo = FetchInfoDirectory | FetchInfoBrowsableFile;

		function readWebkitEntriesAsync(webkitDirectoryEntry: WebKitDirectoryEntry): Promise<WebKitEntry[]> {
			return new Promise((resolve, reject) => {
				webkitDirectoryEntry.createReader().readEntries(entries => {
					resolve(entries);
				}, reject);
			});
		}

		function webKitFileEntryFileAsync(webKitFileEntry: WebKitFileEntry): Promise<File> {
			return new Promise((resolve, reject) => {
				webKitFileEntry.file(resolve, reject);
			});
		}

		export class MutationManager {
			public get jobsRunningCount(): number {
				return this.jobQueue.size + this.pendingConflicts.length;
			}
			private aborted: boolean;
			private abortSignal: Signal;
			private bytesToUpload: number;
			private readonly changeSelectedDirectory: (id: string) => void;
			private conflictHandler: ConflictHandler | null;
			private directoryOrdering: DirectoryContentOrdering;
			private disposeCompleted: boolean;
			private disposed: boolean;
			private readonly environment: Relay.Environment;
			private readonly eventEmitter: IDBasedEventEmitter<string, FileChangedData>;

			private readonly getSelectedDirectoryId: () => string;
			private readonly jobQueue: MultiQueue<JobInfo>;
			private readonly jobsRunningCountChangedSignal: Signal;
			private jobTimer: number | null;
			private neededFetchInfo: MutationManagerFetchInfo | null;
			private pendingConflicts: ConflictInfo[];
			private readonly recordReader: RecordStoreHelper;
			private readonly totalProgressSignal: Signal;
			private readonly uploadProgressMap: Map<File, number>;
			private readonly versionCache: Map<string, number>;
			public readonly fetchInfoRequiredSignal: Signal;

			public constructor(
				environment: Relay.Environment,
				ordering: DirectoryContentOrdering,
				changeSelectedDirectory: (id: string) => void,
				getSelectedDirectoryId: () => string,
			) {
				this.aborted = false;
				this.environment = environment;
				this.recordReader = new RecordStoreHelper(environment);
				this.jobTimer = null;
				this.directoryOrdering = ordering;
				this.jobQueue = new MultiQueue();
				this.versionCache = new Map();
				this.pendingConflicts = [];
				this.disposed = false;
				this.disposeCompleted = false;
				this.abortSignal = new Signal();
				this.conflictHandler = null;
				this.eventEmitter = new IDBasedEventEmitter();
				this.jobsRunningCountChangedSignal = new Signal();
				this.fetchInfoRequiredSignal = new Signal();
				this.neededFetchInfo = null;
				this.changeSelectedDirectory = changeSelectedDirectory;
				this.getSelectedDirectoryId = getSelectedDirectoryId;
				this.totalProgressSignal = new Signal();
				this.totalProgressSignal.memorize = true;
				this.uploadProgressMap = new Map();
				this.bytesToUpload = 0;
			}

			private currentVersionInfo = <T extends BrowsableFileInfo | DirectoryInfo>(info: T): T => {
				const currentVersion = this.versionCache.get(info.id);
				if (currentVersion != null) {
					if (currentVersion < info.version) {
						this.versionCache.delete(info.id);
						return info;
					}
					const i = info as any;
					return {
						...i,
						version: currentVersion,
					};
				}
				return info;
			};

			private disposeCheck(): void {
				if (this.disposed) {
					throw new Error('Mutation manager is disposed');
				}
			}

			private emitTotalProgress() {
				const uploaded = Array.from(this.uploadProgressMap.entries()).reduce((carry, entry) => {
					return carry + entry[1];
				}, 0);

				this.totalProgressSignal.dispatch(uploaded, this.bytesToUpload);
			}

			private enqueue = <TAction extends ActionHandler>(action: TAction, data: ActionHandlerData<TAction>) => {
				const job: JobInfo<TAction> = {
					action: action,
					data: data,
					preflight: undefined,
				};
				this.jobQueue.enqueue(job);
				this.jobsRunningCountChangedSignal.dispatch();
				this.ensureJobIsRunning();

				if (job.action.preflight != null) {
					// There's some ugly typings going on here, I don't like it
					job.preflight = (job.action.preflight(
						{
							relayEnvironment: this.environment,
						},
						job.data,
					) as any) as undefined;
				}
			};

			private enqueueHighPriority = <TAction extends ActionHandler>(
				action: TAction,
				data: ActionHandlerData<TAction>,
			): void => {
				if (this.jobQueue.highPriority.size !== 0) {
					throw new Error('Can only continue with a single element');
				}
				this.jobQueue.enqueueHighPriority({
					action: action,
					data: data,
				});
				this.jobsRunningCountChangedSignal.dispatch();
				this.ensureJobIsRunning();
			};

			private ensureJobIsRunning(): void {
				if (this.disposeCompleted) {
					return;
				}
				if (this.jobTimer != null) {
					return;
				}

				if (this.aborted) {
					this.aborted = false;
					// Clear the conflicts as well as the normal queue.
					this.pendingConflicts = [];
					this.jobQueue.clearNormal();
					if (!this.jobQueue.isEmpty) {
						const peekedJob = this.jobQueue.peek();

						if (peekedJob.action !== DeleteFileAction) {
							// Only leave behind deletion jobs. They should only end up here as a direct result
							// of aborting an upload
							this.jobQueue.dequeue();
						}
					}
				}

				if (this.jobQueue.isEmpty) {
					if (this.pendingConflicts.length > 0) {
						this.mapConflictsToJobs();
					} else {
						// We have no more work to be done, let's clear the cache
						this.versionCache.clear();
						this.uploadProgressMap.clear();
						this.bytesToUpload = 0;
						this.emitTotalProgress();
						if (this.disposed) {
							this.disposeFinalize();
						}
						return;
					}
				}

				this.jobTimer = window.setTimeout(this.initiateWork, 0);
			}

			private initiateWork = async () => {
				const job = this.jobQueue.dequeue();
				if (this.disposed) {
					this.jobTimer = null;
					return;
				}
				try {
					await job.action.execute(
						{
							addJob: this.enqueue,
							addNewEntryVersion: (entryId: string, version: number) => {
								this.versionCache.set(entryId, version);
							},
							addPendingConflict: conflict => {
								this.pendingConflicts.push(conflict);
							},
							changeSelectedDirectory: this.changeSelectedDirectory,
							continueWith: this.enqueueHighPriority,
							fetchBrowsableFileByName: this.fetchBrowsableFileInfo,
							fetchDirectoryByName: this.fetchDirectoryInfo,
							fileChanged: (id: string | null, file: File, fileData: FileChangedData) => {
								if (id != null) {
									this.eventEmitter.emit(id, fileData);
								}
								if (fileData.kind !== FileChangedKind.UploadBegun) {
									this.uploadProgressMap.set(
										file,
										fileData.kind === FileChangedKind.UploadFinished ? file.size : fileData.progress,
									);
									this.emitTotalProgress();
								}
							},
							getCurrentEntry: this.currentVersionInfo,
							getDirectoryOrdering: () => this.directoryOrdering,
							getSelectedDirectoryId: this.getSelectedDirectoryId,
							onAbort: this.onAbort,
							preflightData: job.preflight || {},
							readBrowsableFileInfo: (id: string): BrowsableFileInfo =>
								this.recordReader.readCurrentBrowsableFileInfo(id),
							readBrowsableFileTrailInfo: (browsableFile: BrowsableFileInfo) =>
								this.recordReader.attemptReadFileTrailInfo(browsableFile),
							readDirectoryInfo: (id: string): DirectoryInfo => this.recordReader.readCurrentDirectoryInfo(id),
							relayEnvironment: this.environment,
							showError: (header, message) => {
								notes.error(header, message, {
									clickToClose: true,
									timeout: 15 * SECOND,
								});
							},
						},
						job.data,
					);
				} catch (e) {
					if (e !== MANAGER_DISPOSED_ERROR) {
						// tslint:disable-next-line:no-console
						console.error(e);
					}
				} finally {
					this.jobTimer = null;
					this.jobsRunningCountChangedSignal.dispatch();
					this.ensureJobIsRunning();
				}
			};

			private mapConflictsToJobs() {
				if (this.pendingConflicts.length === 0) {
					throw new Error('No conflicts found');
				}
				const firstConflict = this.pendingConflicts[0];

				const conflictKind = firstConflict.kind;

				const sameConflicts = this.pendingConflicts.filter(x => x.kind === conflictKind);

				sameConflicts.forEach(con => {
					this.pendingConflicts.splice(this.pendingConflicts.indexOf(con), 1);
				});

				const conflictHandler = makeActionHandler<{}>({
					execute: actionInfo => {
						return new ProsourceFilemise<void>(resolve => {
							if (this.conflictHandler == null) {
								throw new Error('No conflict handler set');
							}
							this.conflictHandler(sameConflicts, resolve);
						});
					},
				});
				this.jobQueue.enqueueHighPriority({
					action: conflictHandler,
					data: {},
				});
			}

			private onAbort = (cb: () => void): (() => void) => {
				this.abortSignal.add(cb);

				return () => this.abortSignal.remove(cb);
			};

			private async populateUploadProgressMap(entry: File | WebKitEntry): Promise<void> {
				const webkitEntry = entry as WebKitEntry;
				if (webkitEntry.isDirectory) {
					const entries = await readWebkitEntriesAsync(webkitEntry as WebKitDirectoryEntry);
					await Promise.all(entries.map(subEntry => this.populateUploadProgressMap(subEntry)));
				} else if (webkitEntry.isFile) {
					const file = await webKitFileEntryFileAsync(webkitEntry as WebKitFileEntry);
					await this.populateUploadProgressMap(file);
				} else {
					const file = entry as File;
					this.bytesToUpload += file.size;
				}
			}

			public abort() {
				this.disposeCheck();
				if (this.jobTimer != null) {
					this.aborted = true;
					this.abortSignal.dispatch();
				}
			}

			public addFileChangedListener(id: string, listener: (data: FileChangedData) => void) {
				this.eventEmitter.subscribeTo(id, listener);
			}

			public addJobRunningCountChangedListener(listener: () => void): void {
				this.jobsRunningCountChangedSignal.add(listener);
			}

			public clearConflictHandler(handler: ConflictHandler): void {
				if (this.conflictHandler !== handler) {
					throw new Error('Handler is not set');
				}
				this.conflictHandler = null;
			}

			public createDirectory(parentDirectoryId: string, name: string): void {
				this.disposeCheck();
				const parentInfo = this.recordReader.readCurrentDirectoryInfo(parentDirectoryId);
				this.enqueue(CreateDirectoryAction, {
					name: name,
					parentDirectoryInfo: parentInfo,
				});
			}

			public deleteDirectory(directoryId: string): void {
				this.disposeCheck();
				const directoryInfo = this.recordReader.readCurrentDirectoryInfo(directoryId);
				if (directoryInfo.parentId == null) {
					throw new Error('Cannot delete a directory without a parent');
				}
				this.enqueue(DeleteDirectoryAction, {
					directoryInfo: directoryInfo,
				});
			}

			public deleteFile(fileId: string): void {
				this.disposeCheck();
				const file = this.recordReader.readCurrentBrowsableFileInfo(fileId);
				const fileData: DeleteFileData = {
					fileInfo: file,
				};
				this.enqueue(DeleteFileAction, fileData);
			}

			public dispose() {
				this.disposed = true;

				// We call this to ensure that if no job is running, we finalize the dispose.
				// Disposing is delayed to make all jobs run to completion.
				this.ensureJobIsRunning();
			}
			public disposeFinalize() {
				// Figure out something better here
				// but if we dispose these right away some might have issues unsubbing.
				setTimeout(() => {
					this.disposeCompleted = true;
					this.eventEmitter.dispose();
					this.jobsRunningCountChangedSignal.dispose();
					this.fetchInfoRequiredSignal.dispose();
					this.totalProgressSignal.dispose();
				}, 100);
			}

			public fetchBrowsableFileInfo = (directoryId: string, name: string): Promise<BrowsableFileInfo | null> => {
				// tslint:disable-next-line:promise-must-complete
				return new Promise<string | null>((resolve, reject) => {
					if (this.neededFetchInfo != null) {
						throw new Error('Can only fetch a single entity at a time');
					}
					this.neededFetchInfo = {
						directoryId: directoryId,
						entityType: 'BrowsableFile',
						name: name,
						reject: reject,
						resolve: resolve,
					};
					this.fetchInfoRequiredSignal.dispatch();
				}).then(id => {
					this.neededFetchInfo = null;
					this.fetchInfoRequiredSignal.dispatch();
					if (id == null) {
						return null;
					}
					return this.recordReader.readCurrentBrowsableFileInfo(id);
				});
			};

			public fetchDirectoryInfo = (directoryId: string, name: string): Promise<DirectoryInfo | null> => {
				// tslint:disable-next-line:promise-must-complete
				return new Promise<string | null>((resolve, reject) => {
					if (this.neededFetchInfo != null) {
						throw new Error('Can only fetch a single entity at a time');
					}
					this.neededFetchInfo = {
						directoryId: directoryId,
						entityType: 'Directory',
						name: name,
						reject: reject,
						resolve: resolve,
					};
					this.fetchInfoRequiredSignal.dispatch();
				}).then(id => {
					this.neededFetchInfo = null;
					this.fetchInfoRequiredSignal.dispatch();
					if (id == null) {
						return null;
					}
					return this.recordReader.readCurrentDirectoryInfo(id);
				});
			};

			public moveDirectory(directoryId: string, targetDirectoryId: string): void {
				this.disposeCheck();
				const targetDirectory = this.recordReader.readCurrentDirectoryInfo(targetDirectoryId);
				const directory = this.recordReader.readCurrentDirectoryInfo(directoryId);
				if (directory.parentId == null) {
					throw new Error('Cannot move a directory without a parent');
				}
				const oldDirectoryInfo = this.recordReader.readCurrentDirectoryInfo(directory.parentId);
				const data: MoveDirectoryData = {
					directoryInfo: directory,
					oldParentDirectoryInfo: oldDirectoryInfo,
					parentDirectoryInfo: targetDirectory,
				};
				this.enqueue(MoveDirectoryAction, data);
			}

			public moveFile(fileId: string, targetDirectoryId: string): void {
				this.disposeCheck();
				const targetDirectory = this.recordReader.readCurrentDirectoryInfo(targetDirectoryId);
				const file = this.recordReader.readCurrentBrowsableFileInfo(fileId);
				const oldDirectoryInfo = this.recordReader.readCurrentDirectoryInfo(file.directoryId);
				const data: MoveFileData = {
					directoryInfo: targetDirectory,
					fileInfo: file,
					oldDirectoryInfo: oldDirectoryInfo,
				};
				this.enqueue(MoveFileAction, data);
			}

			public removeFileChangedListener(id: string, listener: (data: FileChangedData) => void) {
				this.eventEmitter.unsubscribeFrom(id, listener);
			}

			public removeJobRunningCountChangedListener(listener: () => void): void {
				this.jobsRunningCountChangedSignal.remove(listener);
			}

			public renameDirectory(directoryId: string, newName: string): void {
				this.disposeCheck();
				const directoryInfo = this.recordReader.readCurrentDirectoryInfo(directoryId);
				this.enqueue(RenameDirectoryAction, {
					directoryInfo: directoryInfo,
					newName: newName,
				});
			}

			public renameFile(fileId: string, newName: string): void {
				this.disposeCheck();
				const fileInfo = this.recordReader.readCurrentBrowsableFileInfo(fileId);
				this.enqueue(RenameFileAction, {
					fileInfo: fileInfo,
					newName: newName,
				});
			}

			public renderFetchInfo(): JSX.Element | null {
				if (this.neededFetchInfo == null) {
					return null;
				}
				return <MutationManagerFetchNamedEntity environment={this.environment} fetchInfo={this.neededFetchInfo} />;
			}

			public setConflictHandler(handler: ConflictHandler): void {
				this.conflictHandler = handler;
			}

			public setDirectoryOrdering(ordering: DirectoryContentOrdering) {
				this.disposeCheck();
				this.directoryOrdering = ordering;
			}

			public subscribeToTotalProgress(callback: (bytesUploaded: number, totalBytesToUpload: number) => void): void {
				this.disposeCheck();
				this.totalProgressSignal.add(callback);
			}

			public unsubscribeFromTotalProgress(callback: (bytesUploaded: number, totalBytesToUpload: number) => void): void {
				this.totalProgressSignal.remove(callback);
			}

			public uploadDirectory(parentDirectoryId: string, webkitDirectoryEntry: WebKitDirectoryEntry): void {
				this.disposeCheck();
				const parentInfo = this.recordReader.readCurrentDirectoryInfo(parentDirectoryId);
				this.populateUploadProgressMap(webkitDirectoryEntry).then(
					() => {
						this.emitTotalProgress();
						this.enqueue(UploadDirectoryAction, {
							parentDirectoryInfo: parentInfo,
							webkitDirectoryEntry: webkitDirectoryEntry,
						});
					},
					err => {
						// Maybe show the user a notification here?
						// tslint:disable-next-line:no-console
						console.error(err);
					},
				);
			}

			public uploadFile(file: File, directoryId: string): void {
				this.disposeCheck();
				const directory = this.recordReader.readCurrentDirectoryInfo(directoryId);
				const data: UploadFileData = {
					asCopy: false,
					directoryInfo: directory,
					file: file,
					retries: 0,
				};
				this.populateUploadProgressMap(file).then(
					() => {
						this.emitTotalProgress();
						this.enqueue(UploadFileAction, data);
					},
					err => {
						console.log('test');
						// Maybe show the user a notification here?
						// tslint:disable-next-line:no-console
						console.error(err);
					},
				);
			}
		}
`;

		const sourceFile = parseText(code);
		const scope = getScopeForNode(findScopeNode(sourceFile, 'uploadFile'));
		scope.dangerousMutateToPrintFriendlyScope();
		expect(scope).toMatchInlineSnapshot(`
		Scope {
		  "bindings": Map {
		    "file" => {
		      "bindingScopeKind": "FunctionScope",
		      "declaringNode": null,
		      "identifier": "file",
		      "mutability": "Mutable",
		      "references": null,
		    },
		    "directoryId" => {
		      "bindingScopeKind": "FunctionScope",
		      "declaringNode": null,
		      "identifier": "directoryId",
		      "mutability": "Mutable",
		      "references": null,
		    },
		    "directory" => {
		      "bindingScopeKind": "LexicalScope",
		      "declaringNode": null,
		      "identifier": "directory",
		      "mutability": "Immutable",
		      "references": null,
		    },
		    "data" => {
		      "bindingScopeKind": "LexicalScope",
		      "declaringNode": null,
		      "identifier": "data",
		      "mutability": "Immutable",
		      "references": null,
		    },
		  },
		  "childScopes": null,
		  "declaringNode": null,
		  "parentScope": Scope {
		    "bindings": Map {
		      "this" => {
		        "bindingScopeKind": "FunctionScope",
		        "declaringNode": null,
		        "identifier": "this",
		        "mutability": "Immutable",
		        "references": null,
		      },
		    },
		    "childScopes": null,
		    "declaringNode": null,
		    "parentScope": Scope {
		      "bindings": Map {
		        "MutationManagerFetchNamedEntity" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "MutationManagerFetchNamedEntity",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "WebKitDirectoryEntry" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "WebKitDirectoryEntry",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "WebKitEntry" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "WebKitEntry",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "WebKitFileEntry" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "WebKitFileEntry",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "makeActionHandler" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "makeActionHandler",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "ActionHandler" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "ActionHandler",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "ActionHandlerData" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "ActionHandlerData",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "FileChangedData" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "FileChangedData",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "FileChangedKind" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "FileChangedKind",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "CreateDirectoryAction" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "CreateDirectoryAction",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "DeleteDirectoryAction" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "DeleteDirectoryAction",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "DeleteFileAction" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "DeleteFileAction",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "DeleteFileData" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "DeleteFileData",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "MoveDirectoryAction" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "MoveDirectoryAction",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "MoveDirectoryData" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "MoveDirectoryData",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "MoveFileAction" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "MoveFileAction",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "MoveFileData" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "MoveFileData",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "RenameDirectoryAction" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "RenameDirectoryAction",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "RenameFileAction" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "RenameFileAction",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "UploadDirectoryAction" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "UploadDirectoryAction",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "UploadFileAction" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "UploadFileAction",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "UploadFileData" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "UploadFileData",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "ConflictInfo" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "ConflictInfo",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "IDBasedEventEmitter" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "IDBasedEventEmitter",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "JobInfo" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "JobInfo",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "MultiQueue" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "MultiQueue",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "BrowsableFileInfo" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "BrowsableFileInfo",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "DirectoryInfo" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "DirectoryInfo",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "RecordStoreHelper" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "RecordStoreHelper",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "Notifications" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "Notifications",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "DirectoryContentOrdering" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "DirectoryContentOrdering",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "Relay" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "Relay",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "Signal" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "Signal",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "MANAGER_DISPOSED_ERROR" => {
		          "bindingScopeKind": "LexicalScope",
		          "declaringNode": null,
		          "identifier": "MANAGER_DISPOSED_ERROR",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "notes" => {
		          "bindingScopeKind": "LexicalScope",
		          "declaringNode": null,
		          "identifier": "notes",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "SECOND" => {
		          "bindingScopeKind": "LexicalScope",
		          "declaringNode": null,
		          "identifier": "SECOND",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "readWebkitEntriesAsync" => {
		          "bindingScopeKind": "LexicalScope",
		          "declaringNode": null,
		          "identifier": "readWebkitEntriesAsync",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "webKitFileEntryFileAsync" => {
		          "bindingScopeKind": "LexicalScope",
		          "declaringNode": null,
		          "identifier": "webKitFileEntryFileAsync",
		          "mutability": "Immutable",
		          "references": null,
		        },
		        "MutationManager" => {
		          "bindingScopeKind": "FunctionScope",
		          "declaringNode": null,
		          "identifier": "MutationManager",
		          "mutability": "Immutable",
		          "references": null,
		        },
		      },
		      "childScopes": null,
		      "declaringNode": null,
		      "parentScope": null,
		      "references": [
		        {
		          "identifier": "Error",
		          "isInitializer": false,
		          "referenceTo": null,
		          "referencedFromScope": null,
		          "writeExpr": null,
		        },
		        {
		          "identifier": "MANAGER_DISPOSED_ERROR",
		          "isInitializer": true,
		          "referenceTo": {},
		          "referencedFromScope": null,
		          "writeExpr": null,
		        },
		        {
		          "identifier": "Notifications",
		          "isInitializer": false,
		          "referenceTo": {},
		          "referencedFromScope": null,
		          "writeExpr": null,
		        },
		        {
		          "identifier": "notes",
		          "isInitializer": true,
		          "referenceTo": {},
		          "referencedFromScope": null,
		          "writeExpr": null,
		        },
		        {
		          "identifier": "SECOND",
		          "isInitializer": true,
		          "referenceTo": {},
		          "referencedFromScope": null,
		          "writeExpr": null,
		        },
		      ],
		      "scopeKind": "FunctionScope",
		    },
		    "references": [],
		    "scopeKind": "FunctionScope",
		  },
		  "references": [
		    {
		      "identifier": "directoryId",
		      "isInitializer": false,
		      "referenceTo": {},
		      "referencedFromScope": null,
		      "writeExpr": null,
		    },
		    {
		      "identifier": "directory",
		      "isInitializer": true,
		      "referenceTo": {},
		      "referencedFromScope": null,
		      "writeExpr": null,
		    },
		    {
		      "identifier": "directory",
		      "isInitializer": false,
		      "referenceTo": {},
		      "referencedFromScope": null,
		      "writeExpr": null,
		    },
		    {
		      "identifier": "file",
		      "isInitializer": false,
		      "referenceTo": {},
		      "referencedFromScope": null,
		      "writeExpr": null,
		    },
		    {
		      "identifier": "data",
		      "isInitializer": true,
		      "referenceTo": {},
		      "referencedFromScope": null,
		      "writeExpr": null,
		    },
		    {
		      "identifier": "file",
		      "isInitializer": false,
		      "referenceTo": {},
		      "referencedFromScope": null,
		      "writeExpr": null,
		    },
		  ],
		  "scopeKind": "FunctionScope",
		}
	`);
	});
});
