import { Log } from '../../util/log';
import { DebugConnection } from '../connection';
import { BaseActorProxy } from './base';
import { BreakpointListActorProxy } from './breakpointList';
import { ConsoleActorProxy } from './console';
import { TargetActorProxy } from './target';
import { IThreadActorProxy, ThreadActorProxy } from './thread';
import { SourceMappingThreadActorProxy } from '../sourceMaps/thread';
import { ThreadConfigurationActorProxy } from './threadConfiguration';

export type ResourceType = 'console-message' | 'error-message' | 'source' | 'thread-state';
export type TargetType = 'frame' | 'worker' | 'content_script';

const log = Log.create('WatcherActorProxy');

export class WatcherActorProxy extends BaseActorProxy {

	constructor(
		name: string,
		public readonly supportsContentScriptTargets: boolean,
		connection: DebugConnection
	) {
		super(name, connection, log);
	}

	public async getBreakpointList() {
		return await this.sendCachedRequest(
			'getBreakpointListActor',
			{ type: 'getBreakpointListActor' },
			(response: FirefoxDebugProtocol.GetBreakpointListResponse) => new BreakpointListActorProxy(response.breakpointList.actor, this.connection)
		);
	}

	public async getThreadConfiguration() {
		return await this.sendCachedRequest(
			'getThreadConfigurationActor',
			{ type: 'getThreadConfigurationActor' },
			(response: FirefoxDebugProtocol.GetThreadConfigurationResponse) => new ThreadConfigurationActorProxy(response.configuration.actor, this.connection)
		);
	}

	public async watchResources(resourceTypes: ResourceType[]) {
		await this.sendRequest({ type: 'watchResources', resourceTypes });
	}

	public async watchTargets(targetType: TargetType) {
		await this.sendRequest({ type: 'watchTargets', targetType });
	}

	public onTargetAvailable(cb: (target: [TargetActorProxy, IThreadActorProxy, ConsoleActorProxy]) => void) {
		this.on('targetAvailable', cb);
	}

	public onTargetDestroyed(cb: (targetActorName: string) => void) {
		this.on('targetDestroyed', cb);
	}

	handleEvent(event: FirefoxDebugProtocol.TargetAvailableEvent | FirefoxDebugProtocol.TargetDestroyedEvent): void {
		if (event.type === 'target-available-form') {
			const targetActorProxy = new TargetActorProxy(event.target, this.connection);
			const threadActorProxy = new ThreadActorProxy(event.target.threadActor, this.connection);
			const consoleActorProxy = new ConsoleActorProxy(event.target.consoleActor, this.connection);
			const sourcemappingThreadActorProxy = new SourceMappingThreadActorProxy(threadActorProxy, consoleActorProxy, this.connection);
			this.emit('targetAvailable', [targetActorProxy, sourcemappingThreadActorProxy, consoleActorProxy]);
		} else if (event.type === 'target-destroyed-form') {
			this.emit('targetDestroyed', event.target.actor);
		} else {
			log.warn(`Unknown message: ${JSON.stringify(event)}`);
		}
	}
}
