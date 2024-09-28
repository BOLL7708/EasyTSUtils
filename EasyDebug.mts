export default class EasyDebug {
    private static _logLevel: EEasyDebugLogLevel
    static setLogLevel(logLevel: EEasyDebugLogLevel) {
        this._logLevel = logLevel
    }

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
            const logMessage = `${tag} ${message}`
            switch(level) {
                case EEasyDebugLogLevel.Error:
                    console.error(logMessage, ...extras)
                    break
                case EEasyDebugLogLevel.Warning:
                    console.warn(logMessage, ...extras)
                    break
                case EEasyDebugLogLevel.Info:
                    console.info(logMessage, ...extras)
                    break
                case EEasyDebugLogLevel.Debug:
                    console.debug(logMessage, ...extras)
                    break
                case EEasyDebugLogLevel.Verbose:
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