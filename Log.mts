export interface ILogOptions {
    logLevel: EEasyDebugLogLevel
    useColors: boolean
    tagPrefix: string
    tagPostfix: string
    capitalizeTag: boolean
}

export enum EEasyDebugLogLevel {
    None,
    Verbose,
    Debug,
    Info,
    Warning,
    Error,
}

/**
 * Convenience class for outputting various levels of logging to the console.
 * Takes inspiration from LogCat in AndroidStudio.
 */
export default class Log {
    private static readonly TAG = this.name
    private static _options: ILogOptions = {
        logLevel: EEasyDebugLogLevel.None,
        useColors: false,
        tagPrefix: '',
        tagPostfix: ' ',
        capitalizeTag: false
    }

    /**
     * Provide options for logging.
     * @param options
     */
    static setOptions(options: ILogOptions): void {
        this._options = options
        this.i(this.TAG, 'Options updated, logging level is now', EEasyDebugLogLevel[options.logLevel])
    }

    /**
     * Set from which level and above that logs should be printed to the console.
     * The default is none, which won't print anything.
     * @param logLevel
     */
    static setLogLevel(logLevel: EEasyDebugLogLevel) {
        this._options.logLevel = logLevel
        this.i(this.TAG, 'Logging level is now', EEasyDebugLogLevel[logLevel])
    }

    static v(tag: string, message: string, ...extras: any[]) {
        this.outputToConsole(tag, EEasyDebugLogLevel.Verbose, message, ...extras)
    }

    static d(tag: string, message: string, ...extras: any[]) {
        this.outputToConsole(tag, EEasyDebugLogLevel.Debug, message, ...extras)
    }

    static i(tag: string, message: string, ...extras: any[]) {
        this.outputToConsole(tag, EEasyDebugLogLevel.Info, message, ...extras)
    }

    static w(tag: string, message: string, ...extras: any[]) {
        this.outputToConsole(tag, EEasyDebugLogLevel.Warning, message, ...extras)
    }

    static e(tag: string, message: string, ...extras: any[]) {
        this.outputToConsole(tag, EEasyDebugLogLevel.Error, message, ...extras)
    }

    /**
     * Log message if the provided level is equal to or higher than the set level.
     * @param tag
     * @param level
     * @param message
     * @param extras
     * @private
     */
    private static outputToConsole(tag: string, level: EEasyDebugLogLevel, message: string, ...extras: any[]) {
        if (
            this._options.logLevel === EEasyDebugLogLevel.None ||
            level.valueOf() < this._options.logLevel.valueOf()
        ) return

        const useColors = this._options.useColors ? '%c' : ''
        if (this._options.capitalizeTag) tag = tag.toLocaleUpperCase()
        const logMessage = `${useColors}${this._options.tagPrefix}${tag}${this._options.tagPostfix}${message}`
        switch (level) {
            case EEasyDebugLogLevel.Verbose:
                if (useColors) extras.unshift('color: gray;')
                console.log(logMessage, ...extras)
                break
            case EEasyDebugLogLevel.Debug:
                if (useColors) extras.unshift('color: turquoise;')
                console.log(logMessage, ...extras)
                break
            case EEasyDebugLogLevel.Info:
                if (useColors) extras.unshift('color: olivedrab;')
                console.log(logMessage, ...extras)
                break
            case EEasyDebugLogLevel.Warning:
                if (useColors) extras.unshift('color: yellow;')
                console.log(logMessage, ...extras)
                break
            case EEasyDebugLogLevel.Error:
                if (useColors) extras.unshift('color: red;')
                console.log(logMessage, ...extras)
                break
        }
    }
}
