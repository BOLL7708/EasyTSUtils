import Log from './Log.mts'

export interface IWebsocketsClientOptions {
    clientName: string
    serverUrl: string
    reconnectIntervalSeconds?: number
    messageQueueing?: boolean
    messageMaxQueueSeconds?: number
    onOpen?: IEasyWSOpenCallback
    onClose?: IEasyWSCloseCallback
    onMessage?: IEasyWSMessageCallback
    onError?: IEasyWSErrorCallback
    subProtocolValues?: string[]
}

export default class WebSocketClient {
    private readonly TAG
    private _options: IWebsocketsClientOptions
    private _onOpen: IEasyWSOpenCallback
    private _onClose: IEasyWSCloseCallback
    private _onMessage: IEasyWSMessageCallback
    private _onError: IEasyWSErrorCallback

    constructor(options: IWebsocketsClientOptions) {
        this._options = options
        this.TAG = `${this.constructor.name}->${this._options.clientName}`
        this._onOpen = options.onOpen ?? (() => {
            Log.v(this.TAG, 'onOpen callback not set')
        })
        this._onClose = options.onClose ?? (() => {
            Log.v(this.TAG, 'onClose callback not set')
        })
        this._onMessage = options.onMessage ?? (() => {
            Log.v(this.TAG, 'onMessage callback not set')
        })
        this._onError = options.onError ?? (() => {
            Log.v(this.TAG, 'onError callback not set')
        })
    }

    private _socket?: WebSocket
    private _connected = false
    private _messageQueue: QueueItem[] = []
    private _reconnectIntervalHandle?: number
    private _resolverQueue: Map<string, (result: any) => void> = new Map()

    init() {
        this.startConnectLoop(true)
    }

    send(body: string | object | [] | number | boolean | null) {
        if (typeof body !== 'string') body = JSON.stringify(body)
        if (this._connected) {
            this._socket?.send(body)
            Log.v(this.TAG, 'Sent message', body)
        } else if (this._options.messageQueueing) {
            this._messageQueue.push(new QueueItem(Date.now(), body))
            Log.d(this.TAG, 'Not connected, adding to queue (entries)', this._messageQueue.length)
        }
    }

    /**
     * Will close the connection and restart it.
     */
    reconnect() {
        this._socket?.close()
        this.startConnectLoop(true)
    }

    /**
     * Will force the connection to close and stay closed until manually triggering a reconnection.
     */
    disconnect() {
        this.stopConnectLoop()
        this._socket?.close()
        this._socket = undefined
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
        this._socket = new WebSocket(this._options.serverUrl, this._options.subProtocolValues)
        this._socket.onopen = (ev => onOpen(this, ev))
        this._socket.onclose = (ev => onClose(this, ev))
        this._socket.onmessage = (ev => onMessage(this, ev))
        this._socket.onerror = (ev => onError(this, ev))

        function onOpen(self: WebSocketClient, ev: Event) {
            Log.i(self.TAG, 'Connected')
            self._connected = true
            self.stopConnectLoop()
            self._onOpen(ev)

            // Will skip messages that are older than the maximum allowed if a limit is set.
            const maxTime = (self._options.messageMaxQueueSeconds ?? 0) * 1000
            const now = Date.now()
            for (const item of self._messageQueue) {
                if (maxTime == 0 || (now - item.time) <= maxTime) {
                    self._socket?.send(item.message)
                }
            }
            self._messageQueue = []
        }

        function onClose(self: WebSocketClient, ev: CloseEvent) {
            Log.i(self.TAG, 'Disconnected')
            self._connected = false
            self.startConnectLoop()
            self._onClose(ev)
        }

        function onMessage(self: WebSocketClient, ev: MessageEvent) {
            Log.v(self.TAG, 'Received message', ev.data)
            self._onMessage(ev)
        }

        function onError(self: WebSocketClient, ev: Event | ErrorEvent) {
            const message = ev instanceof ErrorEvent ? ev.message : 'Unknown issue'
            Log.e(self.TAG, 'Error', message)
            self._socket?.close()
            self.startConnectLoop()
            self._onError(ev)
        }
    }


    private registerResolver(nonce: string, resolver: (result: any) => void, timeoutMs: number) {
        Log.v(this.TAG, 'Registered resolver for nonce with timeout (ms)', nonce, timeoutMs)
        this._resolverQueue.set(nonce, resolver)
        setTimeout(() => {
                const enqueuedResolver = this._resolverQueue.get(nonce)
                if (enqueuedResolver) {
                    enqueuedResolver(undefined)
                    this._resolverQueue.delete(nonce)
                    Log.d(this.TAG, 'Resolver for nonce timed out (ms)', nonce, timeoutMs)
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
            Log.v(this.TAG, 'Ran resolver for nonce', nonce)
        } else {
            Log.w(this.TAG, 'Nonce did not exist in resolver queue, cannot resolve promise', nonce)
        }
    }

    /**
     * Will send a message and store a callback for a unique nonce value until the resolvePromise() method is called
     * with that same nonce value, or the timeout has been triggered, where it will return undefined.
     * @param body
     * @param nonce
     * @param timeoutMs
     */
    sendMessageWithPromise<T>(body: string | object | [] | number | boolean | null, nonce: string, timeoutMs: number = 1000): Promise<T | undefined> {
        if (nonce.length == 0) Log.w(this.TAG, 'Message with promise registered with empty nonce')
        else Log.v(this.TAG, 'Sent message and registered resolver with nonce and timeout (ms)', nonce, timeoutMs)
        return new Promise((resolve, _) => {
            this.registerResolver(nonce, resolve, timeoutMs)
            this.send(body)
        })
    }
}

// region Callbacks
export interface IEasyWSOpenCallback {
    (evt: Event): void
}

export interface IEasyWSCloseCallback {
    (evt: CloseEvent): void
}

export interface IEasyWSMessageCallback {
    (evt: MessageEvent): void
}

export interface IEasyWSErrorCallback {
    (evt: Event | ErrorEvent): void
}

// region

class QueueItem {
    constructor(
        public time: number = 0,
        public message: string = '') {
    }
}