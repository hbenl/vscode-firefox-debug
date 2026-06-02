import { Log } from '../../util/log';
import { DebugConnection } from '../connection';
import { BaseActorProxy } from './base';

let log = Log.create('FrameActorProxy');

export interface IFrameActorProxy {
	name: string;
	frame: FirefoxDebugProtocol.Frame;
	hideCaller: boolean;
	getEnvironment(): Promise<FirefoxDebugProtocol.Environment>
	dispose(): void;
}

/**
 * Proxy class for a frame actor
 * ([docs](https://github.com/mozilla/gecko-dev/blob/master/devtools/docs/backend/protocol.md#listing-stack-frames),
 * [spec](https://github.com/mozilla/gecko-dev/blob/master/devtools/shared/specs/frame.js))
 */
export class FrameActorProxy extends BaseActorProxy implements IFrameActorProxy {

	public hideCaller = false;

	constructor(
		public readonly frame: FirefoxDebugProtocol.Frame,
		connection: DebugConnection
	) {
		super(frame.actor, connection, log);
	}

	isEvent(message: FirefoxDebugProtocol.Response): boolean {
		return false;
	}

	public getEnvironment(): Promise<FirefoxDebugProtocol.Environment> {
		return this.sendCachedRequest('getEnvironment', { type: 'getEnvironment' });
	}
}
