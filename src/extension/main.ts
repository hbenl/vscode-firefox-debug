import * as vscode from 'vscode';
import isAbsoluteUrl from 'is-absolute-url';
import { LoadedScriptsProvider } from './loadedScripts/provider';
import { EventBreakpointsProvider } from './eventBreakpointsProvider';
import { ThreadStartedEventBody, ThreadExitedEventBody, NewSourceEventBody, RemoveSourcesEventBody, PopupAutohideEventBody, AvailableEventsEventBody } from '../common/customEvents';
import { addPathMapping, addNullPathMapping } from './addPathMapping';
import { PopupAutohideManager } from './popupAutohideManager';
import { DebugConfigurationProvider } from './debugConfigurationProvider';
import { createPathMappingForActiveTextEditor, createPathMappingForPath } from './pathMappingWizard';

export function activate(context: vscode.ExtensionContext) {

	const loadedScriptsProvider = new LoadedScriptsProvider();
	const eventBreakpointsProvider = new EventBreakpointsProvider();
	const popupAutohideManager = new PopupAutohideManager(sendCustomRequest);
	const debugConfigurationProvider = new DebugConfigurationProvider();

	context.subscriptions.push(vscode.window.registerTreeDataProvider(
		'extension.firefox-scope-mapping.loadedScripts', loadedScriptsProvider
	));

	const eventBreakpointsView = vscode.window.createTreeView(
		'extension.firefox-scope-mapping.eventBreakpoints', {
			treeDataProvider: eventBreakpointsProvider,
			manageCheckboxStateManually: true,
			showCollapseAll: true,
		}
	);
	context.subscriptions.push(eventBreakpointsView);
	context.subscriptions.push(eventBreakpointsView.onDidChangeCheckboxState(e => {
		eventBreakpointsProvider.updateActiveEventBreakpoints(e);
		sendCustomRequest('setActiveEventBreakpoints', [...eventBreakpointsProvider.activeEventBreakpoints]);
	}));

	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider(
		'firefox', debugConfigurationProvider
	));

	context.subscriptions.push(vscode.commands.registerCommand(
		'extension.firefox-scope-mapping.reloadAddon', () => sendCustomRequest('reloadAddon')
	));

	context.subscriptions.push(vscode.commands.registerCommand(
		'extension.firefox-scope-mapping.toggleSkippingFile', (url) => sendCustomRequest('toggleSkippingFile', url)
	));

	context.subscriptions.push(vscode.commands.registerCommand(
		'extension.firefox-scope-mapping.openScript', openScript
	));

	context.subscriptions.push(vscode.commands.registerCommand(
		'extension.firefox-scope-mapping.addPathMapping', addPathMapping
	));

	context.subscriptions.push(vscode.commands.registerCommand(
		'extension.firefox-scope-mapping.addFilePathMapping', addPathMapping
	));

	context.subscriptions.push(vscode.commands.registerCommand(
		'extension.firefox-scope-mapping.addNullPathMapping', addNullPathMapping
	));

	context.subscriptions.push(vscode.commands.registerCommand(
		'extension.firefox-scope-mapping.addNullFilePathMapping', addNullPathMapping
	));

	context.subscriptions.push(vscode.commands.registerCommand(
		'extension.firefox-scope-mapping.enablePopupAutohide', () => popupAutohideManager.setPopupAutohide(true)
	));

	context.subscriptions.push(vscode.commands.registerCommand(
		'extension.firefox-scope-mapping.disablePopupAutohide', () => popupAutohideManager.setPopupAutohide(false)
	));

	context.subscriptions.push(vscode.commands.registerCommand(
		'extension.firefox-scope-mapping.togglePopupAutohide', () => popupAutohideManager.togglePopupAutohide()
	));

	context.subscriptions.push(vscode.commands.registerCommand(
		'extension.firefox-scope-mapping.pathMappingWizard', () => createPathMappingForActiveTextEditor(loadedScriptsProvider)
	));

	context.subscriptions.push(vscode.debug.onDidReceiveDebugSessionCustomEvent(
		(event) => onCustomEvent(event, loadedScriptsProvider, eventBreakpointsProvider, popupAutohideManager)
	));

	context.subscriptions.push(vscode.debug.onDidStartDebugSession(
		(session) => onDidStartSession(session, loadedScriptsProvider)
	));

	context.subscriptions.push(vscode.debug.onDidTerminateDebugSession(
		(session) => onDidTerminateSession(session, loadedScriptsProvider, popupAutohideManager)
	));
}

async function sendCustomRequest(command: string, args?: any): Promise<any> {
	await Promise.all([...activeFirefoxDebugSessions].map(
		session => session.customRequest(command, args)
	));
}

const activeFirefoxDebugSessions = new Set<vscode.DebugSession>();

function onDidStartSession(
	session: vscode.DebugSession,
	loadedScriptsProvider: LoadedScriptsProvider
) {
	if (session.type === 'firefox') {
		loadedScriptsProvider.addSession(session);
		activeFirefoxDebugSessions.add(session);
	}
}

function onDidTerminateSession(
	session: vscode.DebugSession,
	loadedScriptsProvider: LoadedScriptsProvider,
	popupAutohideManager: PopupAutohideManager
) {
	if (session.type === 'firefox') {
		loadedScriptsProvider.removeSession(session.id);
		activeFirefoxDebugSessions.delete(session);
		if (activeFirefoxDebugSessions.size === 0) {
			popupAutohideManager.disableButton();
		}
	}
}

function onCustomEvent(
	event: vscode.DebugSessionCustomEvent,
	loadedScriptsProvider: LoadedScriptsProvider,
	eventBreakpointsProvider: EventBreakpointsProvider,
	popupAutohideManager: PopupAutohideManager
) {
	if (event.session.type === 'firefox') {

		switch (event.event) {

			case 'threadStarted':
				loadedScriptsProvider.addThread(<ThreadStartedEventBody>event.body, event.session.id);
				break;

			case 'threadExited':
				loadedScriptsProvider.removeThread((<ThreadExitedEventBody>event.body).id, event.session.id);
				break;

			case 'newSource':
				loadedScriptsProvider.addSource(<NewSourceEventBody>event.body, event.session.id);
				break;

			case 'removeSources':
				loadedScriptsProvider.removeSources((<RemoveSourcesEventBody>event.body).threadId, event.session.id);
				break;

			case 'popupAutohide':
				popupAutohideManager.enableButton((<PopupAutohideEventBody>event.body).popupAutohide);
				break;

			case 'unknownSource':
				createPathMappingForPath(event.body, event.session, loadedScriptsProvider);
				break;

			case 'availableEvents':
				eventBreakpointsProvider.setAvailableEvents(<AvailableEventsEventBody>event.body);
				break;
		}
	}
}

async function openScript(pathOrUri: string) {

	let uri: vscode.Uri;
	if (isAbsoluteUrl(pathOrUri)) {
		uri = vscode.Uri.parse(pathOrUri);
	} else {
		uri = vscode.Uri.file(pathOrUri);
	}

	const doc = await vscode.workspace.openTextDocument(uri);

	vscode.window.showTextDocument(doc);
}
