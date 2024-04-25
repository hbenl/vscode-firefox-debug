import { Log } from '../../util/log';
import { IFrameActorProxy } from '../actorProxy/frame';
import { UrlLocation } from '../../location';
import { GeneratedRange, OriginalScope } from 'tc39-proposal-scope-mapping';
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
				generatedRange => generatedRange.original?.scope === originalScope
			);
			if (originalScope.variables && generatedRangeIndex >= 0) {
				const generatedRange = this.generatedRangeChain[generatedRangeIndex];
				assert(generatedRange.original?.bindings);
				assert(originalScope.variables.length === generatedRange.original.bindings.length);
				for (let i = 0; i < originalScope.variables.length; i++) {
					const varname = originalScope.variables[i];
					const expression = generatedRange.original.bindings[i];
					let value: FirefoxDebugProtocol.Grip = "unavailable";
					if (typeof expression === "string") {
						// TODO support expressions other than constants and variable names
						if (["undefined", "null", "true", "false"].includes(expression)
							|| numberRegex.test(expression)
							|| (expression.startsWith('"') && expression.endsWith('"'))
						) {
							value = eval(expression);
						} else {
							let lookupEnvironment: FirefoxDebugProtocol.Environment | undefined = underlyingEnvironment;
							// TODO support variable shadowing by skipping the innermost environments
							while (lookupEnvironment) {
								if (lookupEnvironment.type === "block") {
									const blockEnvironment = lookupEnvironment as FirefoxDebugProtocol.BlockEnvironment;
									if (blockEnvironment.bindings.variables[expression]) {
										value = (blockEnvironment.bindings.variables[expression] as FirefoxDebugProtocol.DataPropertyDescriptor).value;
										break;
									}
								}
								if (lookupEnvironment.type === "function") {
									const functionEnvironment = lookupEnvironment as FirefoxDebugProtocol.FunctionEnvironment;
									for (const argument of functionEnvironment.bindings.arguments) {
										if (argument[expression]) {
											value = (argument[expression] as FirefoxDebugProtocol.DataPropertyDescriptor).value;
											break;
										}
									}
									if (functionEnvironment.bindings.variables[expression]) {
										value = (functionEnvironment.bindings.variables[expression] as FirefoxDebugProtocol.DataPropertyDescriptor).value;
										break;
									}
								}
								lookupEnvironment = lookupEnvironment.parent;
							}
						}
					}
					variables[varname] = {
						configurable: true,
						enumerable: true,
						writable: true,
						value
					} as FirefoxDebugProtocol.DataPropertyDescriptor;
				}
			}

			originalEnvironment = {
				type: "block",
				bindings: { variables },
				parent: originalEnvironment
			} as FirefoxDebugProtocol.BlockEnvironment;
		}
		return originalEnvironment!;
	}

	public dispose(): void {
	}
}

function findLastIndex<T>(array: T[], predicate: (value: T) => boolean): number {
	const reverseIndex = [...array].reverse().findIndex(predicate);
	return reverseIndex >= 0 ? (array.length - 1) - reverseIndex : -1;
}

function getTopEnvironment(environment: FirefoxDebugProtocol.Environment): FirefoxDebugProtocol.Environment {
	return environment.parent ? getTopEnvironment(environment.parent) : environment;
}
