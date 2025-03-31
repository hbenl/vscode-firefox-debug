import { Log } from '../../util/log';
import { DebugConnection } from '../connection';
import { BaseActorProxy } from './base';
import { FrameActorProxy, IFrameActorProxy } from './frame';

let log = Log.create('ThreadActorProxy');

export interface IThreadActorProxy {
	name: string;
	resume(resumeLimitType?: 'next' | 'step' | 'finish' | 'restart', frameActorID?: string): Promise<void>;
	interrupt(immediately?: boolean): Promise<void>;
	fetchStackFrames(start?: number, count?: number): Promise<IFrameActorProxy[]>;
	getAvailableEventBreakpoints() : Promise<FirefoxDebugProtocol.AvailableEventCategory[]>;
	dispose(): void;
}

/**
 * A ThreadActorProxy is a proxy for a "thread-like actor" (a Tab, Worker or Addon) in Firefox
 * ([docs](https://github.com/mozilla/gecko-dev/blob/master/devtools/docs/backend/protocol.md#interacting-with-thread-like-actors),
 * [spec](https://github.com/mozilla/gecko-dev/blob/master/devtools/shared/specs/thread.js))
 */
export class ThreadActorProxy extends BaseActorProxy implements IThreadActorProxy {

	constructor(name: string, connection: DebugConnection) {
		super(name, connection, log);
	}

	public async resume(resumeLimitType?: 'next' | 'step' | 'finish' | 'restart', frameActorID?: string): Promise<void> {
		const resumeLimit = resumeLimitType ? { type: resumeLimitType } : undefined;
		this.sendRequest({ type: 'resume', resumeLimit, frameActorID });
	}

	public async interrupt(immediately?: boolean): Promise<void> {
		await this.sendRequest({ type: 'interrupt', when: immediately ? '' : 'onNext' });
	}

	public async fetchStackFrames(start = 0, count = 1000): Promise<IFrameActorProxy[]> {
		const response: { frames: FirefoxDebugProtocol.Frame[] } = await this.sendRequest({ type: 'frames', start, count });
		return response.frames.map(frame => new FrameActorProxy(frame, this.connection));
	}

	public async getAvailableEventBreakpoints() : Promise<FirefoxDebugProtocol.AvailableEventCategory[]> {
		return this.sendCachedRequest(
			'getAvailableEventBreakpoints',
			{ type: 'getAvailableEventBreakpoints' },
			(response: FirefoxDebugProtocol.GetAvailableEventBreakpointsResponse) => response.value
		);
	}

	handleEvent(event: FirefoxDebugProtocol.Event): void {
		if (!['paused', 'resumed'].includes(event.type)) {
			log.warn(`Unknown message: ${JSON.stringify(event)}`);
		}
	}
}
