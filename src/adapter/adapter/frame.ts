import { Log } from '../util/log';
import { ThreadAdapter } from './thread';
import { EnvironmentAdapter } from './environment';
import { ScopeAdapter } from './scope';
import { StackFrame } from 'vscode-debugadapter';
import { Registry } from './registry';
import { IFrameActorProxy } from '../firefox/actorProxy/frame';

let log = Log.create('FrameAdapter');

/**
 * Adapter class for a stackframe.
 */
export class FrameAdapter {

	public readonly id: number;
	private _scopeAdapters?: ScopeAdapter[];

	public constructor(
		private readonly frameRegistry: Registry<FrameAdapter>,
		public readonly actor: IFrameActorProxy,
		public readonly threadAdapter: ThreadAdapter
	) {
		this.id = frameRegistry.register(this);
	}

	public async getStackframe(): Promise<StackFrame> {

		let sourceActorName = this.actor.frame.where.actor;
		let sourceAdapter = await this.threadAdapter.findSourceAdapterForActorName(sourceActorName);

		let name: string;
		switch (this.actor.frame.type) {

			case 'call':
				const callFrame = this.actor.frame as FirefoxDebugProtocol.CallFrame;
				name = callFrame.displayName || '[anonymous function]';
				break;

			case 'global':
				name = '[Global]';
				break;

			case 'eval':
			case 'clientEvaluate':
				name = '[eval]';
				break;

			case 'wasmcall':
				name = '[wasm]';
				break;

			default:
				name = `[${this.actor.frame.type}]`;
				log.error(`Unexpected frame type ${this.actor.frame.type}`);
				break;
		}

		return new StackFrame(this.id, name, sourceAdapter.source,
			this.actor.frame.where.line, (this.actor.frame.where.column || 0) + 1);
	}

	public async getScopeAdapters(): Promise<ScopeAdapter[]> {

		if (!this._scopeAdapters) {

			const environment = await this.actor.getEnvironment();
			const environmentAdapter = EnvironmentAdapter.from(environment);
			this._scopeAdapters = environmentAdapter.getScopeAdapters(this);
			if (this.actor.frame.this !== undefined) {
				this._scopeAdapters[0].addThis(this.actor.frame.this);
			}
		}

		return this._scopeAdapters;
	}

	public dispose(): void {
		this.frameRegistry.unregister(this.id);
		this.actor.dispose();
	}
}
