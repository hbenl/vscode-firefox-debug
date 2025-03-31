import { EventEmitter } from 'events';
import { Log } from '../../util/log';
import { DebugConnection } from '../connection';
import { IThreadActorProxy } from '../actorProxy/thread';
import { IFrameActorProxy } from '../actorProxy/frame';

let log = Log.create('SourceMappingThreadActorProxy');

export class SourceMappingThreadActorProxy extends EventEmitter implements IThreadActorProxy {

	public constructor(
		private readonly underlyingActorProxy: IThreadActorProxy,
		private readonly connection: DebugConnection
	) {
		super();
	}

	public get name(): string {
		return this.underlyingActorProxy.name;
	}

	public async fetchStackFrames(
		start?: number,
		count?: number
	): Promise<IFrameActorProxy[]> {

		const underlyingFrames = await this.underlyingActorProxy.fetchStackFrames(start, count);

		return (await Promise.all(underlyingFrames.map(frame => this.connection.sourceMaps.applySourceMapToFrame(frame)))).flat();
	}

	public resume(resumeLimitType?: 'next' | 'step' | 'finish' | 'restart', frameActorID?: string): Promise<void> {
		return this.underlyingActorProxy.resume(resumeLimitType, frameActorID);
	}

	public interrupt(immediately: boolean = true): Promise<void> {
		return this.underlyingActorProxy.interrupt(immediately);
	}

	public async getAvailableEventBreakpoints() : Promise<FirefoxDebugProtocol.AvailableEventCategory[]> {
		return this.underlyingActorProxy.getAvailableEventBreakpoints();
	}

	public dispose(): void {
		this.underlyingActorProxy.dispose();
	}
}
