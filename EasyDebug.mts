export default class EasyDebug {
    /**
     * Set from which level and above that logs should be printed to the console.
     * The default is none, which won't print anything.
     * @param logLevel
     */
    static setLogLevel(logLevel: EEasyDebugLogLevel) {
        this._logLevel = logLevel
    }
    private static _logLevel: EEasyDebugLogLevel

    /**
     * Set to true to use colorized output for the logging.
     * Defaults to on.
     * @param use
     */
    static useColors(use: boolean) {
        this._useColors = use
    }
    private static _useColors: boolean = true

    /**
     * Log message if their level is equal to or higher than the level set in the options.
     * @param tag
     * @param level
     * @param message
     * @param extras
     * @private
     */
    static log(tag: string, level: EEasyDebugLogLevel, message: string, ...extras: any[]) {
        const logLevel = this._logLevel ?? EEasyDebugLogLevel.None
        if(logLevel !== EEasyDebugLogLevel.None && level.valueOf() >= logLevel.valueOf()) {
            const useColors = this._useColors ? '%c' : ''
            const logMessage = `${useColors}${tag} ${message}`
            switch(level) {
                case EEasyDebugLogLevel.Error:
                    if(useColors) extras.unshift('color: red;')
                    console.error(logMessage, ...extras)
                    break
                case EEasyDebugLogLevel.Warning:
                    if(useColors) extras.unshift('color: yellow;')
                    console.warn(logMessage, ...extras)
                    break
                case EEasyDebugLogLevel.Info:
                    if(useColors) extras.unshift('color: olivedrab;')
                    console.info(logMessage, ...extras)
                    break
                case EEasyDebugLogLevel.Debug:
                    if(useColors) extras.unshift('color: turquoise;')
                    console.debug(logMessage, ...extras)
                    break
                case EEasyDebugLogLevel.Verbose:
                    if(useColors) extras.unshift('color: gray;')
                    console.log(logMessage, ...extras)
                    break
            }
        }
    }
}

export enum EEasyDebugLogLevel {
    None,
    Verbose,
    Debug,
    Info,
    Warning,
    Error
}