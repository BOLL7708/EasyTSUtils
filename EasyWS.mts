import WebSocket from 'ws'
import EasyDebug, {EEasyDebugLogLevel} from './EasyDebug.mjs'

export default class EasyWS {
    private readonly TAG
    private _options: IEasyWSOptions
    private _onOpen: IEasyWSOpenCallback
    private _onClose: IEasyWSCloseCallback
    private _onMessage: IEasyWSMessageCallback
    private _onError: IEasyWSErrorCallback

    constructor(options: IEasyWSOptions) {
        this._options = options
        this.TAG = `${this.constructor.name}->${this._options.clientName}:`
        this._onOpen = options.onOpen ?? (() => {
            EasyDebug.log(this.TAG, EEasyDebugLogLevel.Verbose, 'onOpen callback not set')
        })
        this._onClose = options.onClose ?? (() => {
            EasyDebug.log(this.TAG, EEasyDebugLogLevel.Verbose, 'onClose callback not set')
        })
        this._onMessage = options.onMessage ?? (() => {
            EasyDebug.log(this.TAG, EEasyDebugLogLevel.Verbose, 'onMessage callback not set')
        })
        this._onError = options.onError ?? (() => {
            EasyDebug.log(this.TAG, EEasyDebugLogLevel.Verbose, 'onError callback not set')
        })
    }

    private _socket?: WebSocket
    private _connected = false
    private _messageQueue: QueueItem[] = []
    private _reconnectIntervalHandle?: NodeJS.Timeout
    private _resolverQueue: Map<string, (result: any) => void> = new Map()

    init() {
        this.startConnectLoop(true)
    }

    send(body: string|object|[]|number|boolean|null) {
        if(typeof body !== 'string') body = JSON.stringify(body)
        if (this._connected) {
            this._socket?.send(body)
            EasyDebug.log(this.TAG, EEasyDebugLogLevel.Verbose, 'Sent message', body)
        } else if (this._options.messageQueueing) {
            this._messageQueue.push(new QueueItem(Date.now(), body))
            EasyDebug.log(this.TAG, EEasyDebugLogLevel.Debug, 'Not connected, adding to queue (entries)', this._messageQueue.length)
        }
    }

    reconnect() {
        this._socket?.close()
        this.connect()
    }

    disconnect() {
        this._socket?.close()
    }

    isConnected(): boolean {
        return this._connected
    }

    private startConnectLoop(immediate: boolean = false) {
        this.stopConnectLoop()
        this._reconnectIntervalHandle = setInterval(this.connect.bind(this), (this._options.reconnectIntervalSeconds ?? 30) * 1000)
        if (immediate) this.connect()
    }

    private stopConnectLoop() {
        clearInterval(this._reconnectIntervalHandle)
    }

    /**
     * Will instantiate a new client instance and open the connection.
     * @private
     */
    private connect() {
        this._socket?.close()
        this._socket = undefined
        this._socket = new WebSocket(this._options.serverUrl)
        this._socket.onopen = onOpen.bind(this)
        this._socket.onclose = onClose.bind(this)
        this._socket.onmessage = onMessage.bind(this)
        this._socket.onerror = onError.bind(this)
        const self = this;

        function onOpen(evt: WebSocket.Event) {
            EasyDebug.log(self.TAG, EEasyDebugLogLevel.Info, 'Connected')
            self._connected = true
            self.stopConnectLoop()
            self._onOpen(evt)

            // Will skip messages that are older than the maximum allowed if a limit is set.
            const maxTime = (self._options.messageMaxQueueSeconds ?? 0)*1000
            const now = Date.now()
            for(const item of self._messageQueue) {
                if(maxTime == 0 || (now - item.time) <= maxTime) {
                    self._socket?.send(item.message)
                }
            }
            self._messageQueue = []
        }

        function onClose(evt: WebSocket.CloseEvent) {
            EasyDebug.log(self.TAG, EEasyDebugLogLevel.Info, 'Disconnected')
            self._connected = false
            self.startConnectLoop()
            self._onClose(evt)
        }

        function onMessage(evt: WebSocket.MessageEvent) {
            EasyDebug.log(self.TAG, EEasyDebugLogLevel.Verbose, 'Received message', evt.data)
            self._onMessage(evt)
        }

        function onError(evt: WebSocket.ErrorEvent) {
            EasyDebug.log(self.TAG, EEasyDebugLogLevel.Error, 'Error', evt.message)
            self._socket?.close()
            self.startConnectLoop()
            self._onError(evt)
        }
    }


    private registerResolver(nonce: string, resolver: (result: any) => void, timeoutMs: number) {
        EasyDebug.log(this.TAG, EEasyDebugLogLevel.Verbose, 'Registered resolver for nonce with timeout (ms)', nonce, timeoutMs)
        this._resolverQueue.set(nonce, resolver)
        setTimeout(() => {
                const enqueuedResolver = this._resolverQueue.get(nonce)
                if (enqueuedResolver) {
                    enqueuedResolver(undefined)
                    this._resolverQueue.delete(nonce)
                    EasyDebug.log(this.TAG, EEasyDebugLogLevel.Debug, 'Resolver for nonce timed out (ms)', nonce, timeoutMs)
                }
            },
            timeoutMs
        )
    }

    /**
     * Trigger a registered promise resolver with a result.
     * @param nonce
     * @param result
     */
    resolvePromise(nonce: string, result: any) {
        const resolver = this._resolverQueue.get(nonce)
        if (resolver) {
            resolver(result)
            this._resolverQueue.delete(nonce)
            EasyDebug.log(this.TAG, EEasyDebugLogLevel.Verbose, 'Ran resolver for nonce', nonce)
        } else {
            EasyDebug.log(this.TAG, EEasyDebugLogLevel.Warning, 'Nonce did not exist in resolver queue, cannot resolve promise', nonce)
        }
    }

    /**
     * Will send a message and store a callback for a unique nonce value until the resolvePromise() method is called
     * with that same nonce value, or the timeout has been triggered, where it will return undefined.
     * @param body
     * @param nonce
     * @param timeoutMs
     */
    sendMessageWithPromise<T>(body: string|object|[]|number|boolean|null, nonce: string, timeoutMs: number = 1000): Promise<T | undefined> {
        if(nonce.length == 0) EasyDebug.log(this.TAG, EEasyDebugLogLevel.Warning, 'Message with promise registered with empty nonce')
        else EasyDebug.log(this.TAG, EEasyDebugLogLevel.Verbose, 'Sent message and registered resolver with nonce and timeout (ms)', nonce, timeoutMs)
        return new Promise((resolve, _) => {
            this.registerResolver(nonce, resolve, timeoutMs)
            this.send(body)
        })
    }
}

// region Callbacks
export interface IEasyWSOpenCallback {
    (evt: WebSocket.Event): void
}

export interface IEasyWSCloseCallback {
    (evt: WebSocket.CloseEvent): void
}

export interface IEasyWSMessageCallback {
    (evt: WebSocket.MessageEvent): void
}

export interface IEasyWSErrorCallback {
    (evt: WebSocket.ErrorEvent): void
}
// region

export interface IEasyWSOptions {
    clientName: string
    serverUrl: string
    debugLogLevel?: EEasyDebugLogLevel
    reconnectIntervalSeconds?: number
    messageQueueing?: boolean
    messageMaxQueueSeconds?: number
    onOpen?: IEasyWSOpenCallback
    onClose?: IEasyWSCloseCallback
    onMessage?: IEasyWSMessageCallback
    onError?: IEasyWSErrorCallback
}

class QueueItem {
    constructor(
        public time: number = 0,
        public message: string = '') {
    }
}