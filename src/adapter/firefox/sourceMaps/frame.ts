import { Log } from '../../util/log';
import { IFrameActorProxy } from '../actorProxy/frame';
import { UrlLocation } from '../../location';
import { GeneratedRange, OriginalScope } from '@chrome-devtools/source-map-scopes-codec';
import assert from 'assert';

const log = Log.create('SourceMappingFrameActorProxy');

const numberRegex = /^\s*[+-]?(\d+|\d*\.\d+|\d+\.\d*)([Ee][+-]?\d+)?\s*$/;

export class SourceMappingFrameActorProxy implements IFrameActorProxy {

	public readonly frame: FirefoxDebugProtocol.Frame;

	public get name(): string {
		return this.frame.actor;
	}

	public constructor(
		private underlyingActorProxy: IFrameActorProxy,
		originalLocation: UrlLocation,
		originalSourceActorName: string,
		private readonly originalScopeChain: OriginalScope[],
		private readonly generatedRangeChain: GeneratedRange[]
	) {
		this.frame = {
			...underlyingActorProxy.frame,
			actor: `${underlyingActorProxy.name}!${originalLocation.url}`,
			where: {
				actor: originalSourceActorName,
				line: originalLocation.line || undefined,
				column: originalLocation.column || undefined
			}
		};
	}

	public async getEnvironment(): Promise<FirefoxDebugProtocol.Environment> {
		const underlyingEnvironment = await this.underlyingActorProxy.getEnvironment();
		let originalEnvironment = getTopEnvironment(underlyingEnvironment);
		for (const originalScope of this.originalScopeChain) {
			const variables: FirefoxDebugProtocol.PropertyDescriptors = {};

			const generatedRangeIndex = findLastIndex(
				this.generatedRangeChain,
				generatedRange => generatedRange.originalScope === originalScope
			);
			if (originalScope.variables && generatedRangeIndex >= 0) {
				const generatedRange = this.generatedRangeChain[generatedRangeIndex];
				assert(generatedRange.values);
				assert(originalScope.variables.length === generatedRange.values.length);
				const lookupEnvironment = getLookupEnvironment(
					underlyingEnvironment,
					this.generatedRangeChain,
					generatedRangeIndex
				);
				for (let i = 0; i < originalScope.variables.length; i++) {
					const varname = originalScope.variables[i];
					const binding = generatedRange.values[i];
					let expression: string | undefined = undefined;
					if (typeof binding === "string") {
						expression = binding;
					// } else if (Array.isArray(binding)) { TODO
					// 	const where = this.underlyingActorProxy.frame.where;
					// 	const location = { line: (where.line ?? 1) - 1, column: where.column ?? 0 };
					// 	for (let i = 0; i < binding.length; i++) {
					// 		if (isBefore(location, binding[i].start) && isBefore(binding[i].end, location)) {
					// 			expression = binding[i].expression;
					// 			break;
					// 		}
					// 	}
					}
					const value = getValueFromEnvironment(expression, lookupEnvironment);
					variables[varname] = {
						configurable: true,
						enumerable: true,
						writable: true,
						value
					} as FirefoxDebugProtocol.DataPropertyDescriptor;
				}
			}

			if (originalScope.name) {
				originalEnvironment = {
					type: "function",
					bindings: { variables, arguments: [] },
					function: {
						displayName: originalScope.name,
					},
					parent: originalEnvironment
				} as FirefoxDebugProtocol.FunctionEnvironment;
			} else {
				originalEnvironment = {
					type: "block",
					bindings: { variables },
					parent: originalEnvironment
				} as FirefoxDebugProtocol.BlockEnvironment;
			}
		}
		return originalEnvironment!;
	}

	public dispose(): void {
	}
}

function getValueFromEnvironment(expression: string | undefined, environment: FirefoxDebugProtocol.Environment): FirefoxDebugProtocol.Grip {
	if (typeof expression === "string") {
		// TODO support expressions other than constants and variable names
		if (["undefined", "null", "true", "false"].includes(expression)
			|| numberRegex.test(expression)
			|| (expression.startsWith('"') && expression.endsWith('"'))
		) {
			return eval(expression);
		} else {
			if (environment.type === "block") {
				const blockEnvironment = environment as FirefoxDebugProtocol.BlockEnvironment;
				if (blockEnvironment.bindings.variables[expression]) {
					return (blockEnvironment.bindings.variables[expression] as FirefoxDebugProtocol.DataPropertyDescriptor).value;
				}
			}
			if (environment.type === "function") {
				const functionEnvironment = environment as FirefoxDebugProtocol.FunctionEnvironment;
				for (const argument of functionEnvironment.bindings.arguments) {
					if (argument[expression]) {
						return (argument[expression] as FirefoxDebugProtocol.DataPropertyDescriptor).value;
					}
				}
				if (functionEnvironment.bindings.variables[expression]) {
					return (functionEnvironment.bindings.variables[expression] as FirefoxDebugProtocol.DataPropertyDescriptor).value;
				}
			}
			if (environment.parent) {
				return getValueFromEnvironment(expression, environment.parent);
			}
		}
	}
	return "unavailable";
}

function findLastIndex<T>(array: T[], predicate: (value: T) => boolean): number {
	const reverseIndex = [...array].reverse().findIndex(predicate);
	return reverseIndex >= 0 ? (array.length - 1) - reverseIndex : -1;
}

function getTopEnvironment(environment: FirefoxDebugProtocol.Environment): FirefoxDebugProtocol.Environment {
	return environment.parent ? getTopEnvironment(environment.parent) : environment;
}

function getLookupEnvironment(
	environment: FirefoxDebugProtocol.Environment,
	generatedRangeChain: GeneratedRange[],
	generatedRangeIndex: number
): FirefoxDebugProtocol.Environment {
	// for (let i = generatedRangeChain.length - 1; i > generatedRangeIndex; i--) {
	// 	// const generatedRange = generatedRangeChain[i];
	// 	// if (generatedRange.isScope) {
	// 		if (environment.scopeKind === "function lexical") {
	// 			assert(environment.parent);
	// 			environment = environment.parent;
	// 		}
	// 		assert(environment.parent);
	// 		environment = environment.parent;
	// 	// }
	// }
	return environment;
}
