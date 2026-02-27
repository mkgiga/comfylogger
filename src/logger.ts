import { ANSI } from './util/ansi.js';

export type LoggerRuntimeConfig = {
    autoSpaceBetween: boolean;
    timestampFormat?: string;
    trimBefore?: string;
    trimAfter?: string;
    externalLogging?: ComfyLoggerExternalLoggingOptions;
    console?: boolean;
    /**
     * Tags which can be used to categorize loggers.
     * Used for filtering log output.
     */
    tags?: string[];
    logErrorsToConsole?: boolean;
}

export type LoggerEvent = 'log';
export type LoggerEventListener = (e: { output: string; stripped: string }) => void;
export type ComfyLoggerConstructorOptions = Partial<LoggerRuntimeConfig & { listeners?: { log: LoggerEventListener[] } }>;
export type ComfyLoggerExternalLoggingOptions = {
    url: string;
    headers?: Record<string, string>;
    method?: string;
    onError?: (error: any) => void;
};

const sharedGlobalConfig: LoggerRuntimeConfig = {
    autoSpaceBetween: true,
    timestampFormat: 'HH:mm:ss',
    trimBefore: undefined,
    trimAfter: undefined,
    externalLogging: undefined,
    console: true,
    tags: [] as string[],
    logErrorsToConsole: true,
}

export class ComfyLoggerSettings {
    static blacklistTag(tag: string | string[]) {
        if (typeof tag === 'string') {
            __internalGlobalConfig.filter.blacklistTags.add(tag);
        } else if (Array.isArray(tag)) {
            for (const t of tag) {
                __internalGlobalConfig.filter.blacklistTags.add(t);
            }
        }
    }

    static blacklistTags(tags: string[]) {
        for (const tag of tags) {
            __internalGlobalConfig.filter.blacklistTags.add(tag);
        }
    }

    static whitelistTag(tag: string | string[]) {
        if (typeof tag === 'string') {
            __internalGlobalConfig.filter.whitelistTags.add(tag);
        } else if (Array.isArray(tag)) {
            for (const t of tag) {
                __internalGlobalConfig.filter.whitelistTags.add(t);
            }
        }
    }

    static whitelistTags(tags: string[]) {
        for (const tag of tags) {
            __internalGlobalConfig.filter.whitelistTags.add(tag);
        }
    }

    static isTagBlacklisted(tag: string): boolean {
        return __internalGlobalConfig.filter.blacklistTags.has(tag);
    }

    static isTagWhitelisted(tag: string): boolean {
        return __internalGlobalConfig.filter.whitelistTags.has(tag);
    }
}

const __internalGlobalConfig = {
    filter: {
        whitelistTags: new Set<string>(),
        blacklistTags: new Set<string>(),
    }
};

export const cliArgs = {
    '--blacklist-tags': (value: string) => {
        const tags = value.split(',').map(tag => tag.trim());
        for (const tag of tags) {
            ComfyLoggerSettings.blacklistTag(tag);
        }
    },
    '--whitelist-tags': (value: string) => {
        const tags = value.split(',').map(tag => tag.trim());
        for (const tag of tags) {
            ComfyLoggerSettings.whitelistTag(tag);
        }
    },
}

if (typeof process !== 'undefined' && process.argv) {
    for (const arg in process.argv) {
        const handler = cliArgs[process.argv[arg] as keyof typeof cliArgs];
        if (handler) {
            let val = undefined;
            if (Number(arg) + 1 < process.argv.length) {
                val = process.argv[Number(arg) + 1];
                handler(val!);
            } else {
                console.warn(`Expected value after ${process.argv[arg]}, but none found.`);
            }
        }
    }
}
/**
 * A versatile, customizable logger that supports ANSI styling and event listeners to capture log output for various purposes.
 */
export class ComfyLogger {

    options: LoggerRuntimeConfig = {
        autoSpaceBetween: sharedGlobalConfig.autoSpaceBetween,
        timestampFormat: sharedGlobalConfig.timestampFormat,
        externalLogging: sharedGlobalConfig.externalLogging,
        console: sharedGlobalConfig.console,
        tags: [...sharedGlobalConfig.tags ?? []],
        logErrorsToConsole: sharedGlobalConfig.logErrorsToConsole,
    }

    constructor(options?: ComfyLoggerConstructorOptions) {
        if (options) {
            this.configure(options);
            if (options.listeners?.log) {
                for (const listener of options.listeners.log) {
                    this.addEventListener('log', listener);
                }
            }
        }
    }

    #internal = {
        eventListeners: {
            'log': [] as LoggerEventListener[]
        },

        /** User-defined callback functions that perform custom string transformations on the log output before it is displayed or emitted. */
        transformers: {
            before: [] as ((buffer: string) => string)[],
            after: [] as ((buffer: string) => string)[]
        },
        classes: {} as Record<string, StyleFn>
    }

    get tags () {
        return this.options.tags;
    }

    set tags(value) {
        throw new Error("Cannot set tags directly. Use the addTag and removeTag methods to modify tags.");
    }

    transformBefore(args: Array<((buffer: string) => string)> | ((buffer: string) => string)) {
        if (Array.isArray(args)) {
            this.#internal.transformers.before.push(...args as ((buffer: string) => string)[]);
        } else {
            this.#internal.transformers.before.push(args);
        }
    }

    transformAfter(args: Array<((buffer: string) => string)> | ((buffer: string) => string)) {
        if (Array.isArray(args)) {
            this.#internal.transformers.after.push(...args as ((buffer: string) => string)[]);
        } else {
            this.#internal.transformers.after.push(args);
        }
    }

    /**
     * @description Registers an event listener for log events. The listener will receive an object containing both the formatted output with ANSI codes and a stripped version without any ANSI codes. This allows for flexible handling of log messages, such as sending the formatted version to the console and the stripped version to a file or remote logging service.
     * @example Example usage of the log event listener to send logs to a remote server:
     * ```ts
     * logger.addEventListener('log', ({ output, stripped }) => {
     *   const message = stripped;
     *   fetch('https://example.com/log', {
     *     method: 'POST',
     *     headers: { 'Content-Type': 'application/json' },
     *     body: JSON.stringify({ message }),
     *  });
     * }
     * ```
     */
    addEventListener(event: LoggerEvent, listener: LoggerEventListener) {
        this.#internal.eventListeners[event].push(listener);
    }

    /**
     * Removes a previously registered event listener for log events.
     * @param callback The listener function to remove from the log event listeners.
     * @todo index listeners more efficiently with a Map or Set instead of iterating all event types, plus return early when trying to register an event listener that has already been registered (per event type)
     */
    removeEventListener(callback: LoggerEventListener) {
        let foundListeners = [];
        for (const event in this.#internal.eventListeners) {
            const listeners = this.#internal.eventListeners[event as LoggerEvent];
            for (let i = listeners.length - 1; i >= 0; i--) {
                if (listeners[i] === callback) {
                    listeners.splice(i, 1);
                    foundListeners.push(callback);
                }
            }
        }

        if (foundListeners.length === 0) {
            console.warn("Listener not found for removal:", callback);
        }

        return foundListeners.length > 0;
    }

    configure(options: Partial<LoggerRuntimeConfig>) {
        this.options = { ...this.options, ...options };
    }

    #render(strings: TemplateStringsArray | any, ...values: any[]) {
        let result: string;

        if (Array.isArray(strings) && 'raw' in strings) {
            result = (strings as TemplateStringsArray).reduce((acc: string, str: string, i: number) => {
                const val = values[i - 1];
                const part = val !== undefined
                    ? (typeof val === 'function' ? val() : String(val))
                    : '';
                return acc + part + str;
            }, '');
        } else {
            const separator = this.options.autoSpaceBetween ? ' ' : '';
            result = [strings, ...values]
                .map((val: any) => typeof val === 'function' ? val() : String(val))
                .join(separator);
        }

        return result;
    }

    /**
     * Defines a custom style function that can be used in log messages.
     * @param name The name of the custom style. This will become a method on the logger instance that can be used to apply the style to text.
     * @param styleFn A function that takes a string and returns a styled string. This function defines how the custom style will be applied to text.
     * @throws Will throw an error if the provided name conflicts with an existing property on the logger instance.
     */
    class(name: string, styleFn: StyleFn) {
        if (name in this || Object.prototype.hasOwnProperty.call(this, name)) {
            throw new Error(`Cannot define style with name "${name}" as it conflicts with an existing property on the logger.`);
        }
        
        (this as any)[name] = styleFn;
    }

    #shouldLog(): boolean {
        const tags = this.options.tags ?? [];
        const blacklist = ComfyLoggerSettings.isTagBlacklisted;
        const whitelist = ComfyLoggerSettings.isTagWhitelisted;
        for (const tag of tags) {
            
            // precedence to whitelist
            let whitelisted = false;
            if (blacklist(tag)) {
                // unless explicitly whitelisted
                if (!whitelist(tag)) {
                    whitelisted = true;
                }

                if (!whitelisted) {
                    return false;
                }
            }
        }

        return true;
    }

    log(strings: TemplateStringsArray | any, ...values: any[]) {
        if (!this.#shouldLog()) {
            return;
        }
        
        let result = this.#render(strings, ...values);

        for (const transform of this.#internal.transformers.before) {
            result = transform(result);
        }

        let finalMessage = result + ANSI.STYLE.reset;

        for (const transform of this.#internal.transformers.after) {
            finalMessage = transform(finalMessage);
        }

        if (this.options.trimBefore) {
            finalMessage = finalMessage.trimStart();
        }

        if (this.options.trimAfter) {
            finalMessage = finalMessage.trimEnd();
        }

        // you can turn off logging to stdio
        // options.console is true by default
        if (this.options.console) {
            console.log(finalMessage);
        }

        const stripAnsi = (msg: string) =>
            msg.replace(/\x1b(\[[0-9;]*m|]8;;.*?[\u0007]|]8;;[\u0007])/g, '');

        const resultObj = {
            output: finalMessage,
            stripped: stripAnsi(finalMessage),
        };

        for (const onLog of this.#internal.eventListeners['log']) {
            try {
                onLog(resultObj);
            } catch (error) {
                console.error("Error in log event listener:", error);
            }
        }

        if (this.options.externalLogging) {
            const { url, headers = {}, method = 'POST' } = this.options.externalLogging;
            fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers,
                },
                body: JSON.stringify({ message: resultObj.stripped }),
            }).catch(error => {
                if (this.options.logErrorsToConsole) {
                    console.error("Error in external logging:", error);
                }
            });
        }

        return resultObj;
    }

    timestamp(format: string = this.options.timestampFormat ?? 'YYYY-MM-DD HH:mm:ss'): string {
        const now = new Date();
        const fmt = format ?? this.options.timestampFormat ?? 'YYYY-MM-DD HH:mm:ss';
        const replacements: Record<string, string> = {
            'YYYY': String(now.getFullYear()),
            'MM': String(now.getMonth() + 1).padStart(2, '0'),
            'DD': String(now.getDate()).padStart(2, '0'),
            'HH': String(now.getHours()).padStart(2, '0'),
            'mm': String(now.getMinutes()).padStart(2, '0'),
            'ss': String(now.getSeconds()).padStart(2, '0'),
            'SSS': String(now.getMilliseconds()).padStart(3, '0'),
        };

        const raw = Object.entries(replacements).reduce(
            (ts, [token, value]) => ts.replaceAll(token, value),
            fmt
        );

        return `[ ${raw} ]`;
    }

    // convenience methods for common log levels with appropriate styling

    error(strings: TemplateStringsArray | any, ...values: any[]) {
        return this.log(bold(red("ERROR:")), strings, ...values);
    }

    bad(strings: TemplateStringsArray | any, ...values: any[]) {
        return this.log(bold(red(strings)), ...values);
    }

    warn(strings: TemplateStringsArray | any, ...values: any[]) {
        return this.log(bold(yellow(strings)), ...values);
    }

    info(strings: TemplateStringsArray | any, ...values: any[]) {
        return this.log(bold(brightBlue(strings)), ...values);
    }

    debug(strings: TemplateStringsArray | any, ...values: any[]) {
        return this.log(bold(cyan(strings)), ...values);
    }

    ok(strings: TemplateStringsArray | any, ...values: any[]) {
        return this.log(bold(green(strings)), ...values);
    }

    good(strings: TemplateStringsArray | any, ...values: any[]) {
        return this.log(bold(green(strings)), ...values);
    }

    neutral(strings: TemplateStringsArray | any, ...values: any[]) {
        return this.log(bold(white(strings)), ...values);
    }
}

export type StyleFn = ((text?: string) => string) & { toString(): string };


const makeStyle = (code: string): StyleFn => {
    const fn = (text?: string): string =>
        text === undefined ? code : `${code}${text}${ANSI.STYLE.reset}`;
    fn.toString = () => code;
    return fn;
};

/**
 * Creates a reusable `StyleFn` from a composer function.
 * @example
 * const myStyle = style(text => bold(red(underline(text))));
 * myStyle("Hello") // → bold red underlined "Hello"
 */
export const style = (composer: (text: string) => string): StyleFn => {
    const fn = (text?: string): string => composer(text ?? '');
    fn.toString = () => fn('');
    return fn;
}

// x Foreground colors
// -------------------

export const black = makeStyle(ANSI.FG.Black);
export const red = makeStyle(ANSI.FG.Red);
export const green = makeStyle(ANSI.FG.Green);
export const yellow = makeStyle(ANSI.FG.Yellow);
export const blue = makeStyle(ANSI.FG.Blue);
export const magenta = makeStyle(ANSI.FG.Magenta);
export const cyan = makeStyle(ANSI.FG.Cyan);
export const white = makeStyle(ANSI.FG.White);
export const brightBlack = makeStyle(ANSI.FG.BrightBlack);
export const brightRed = makeStyle(ANSI.FG.BrightRed);
export const brightGreen = makeStyle(ANSI.FG.BrightGreen);
export const brightYellow = makeStyle(ANSI.FG.BrightYellow);
export const brightBlue = makeStyle(ANSI.FG.BrightBlue);
export const brightMagenta = makeStyle(ANSI.FG.BrightMagenta);
export const brightCyan = makeStyle(ANSI.FG.BrightCyan);
export const brightWhite = makeStyle(ANSI.FG.BrightWhite);
export const fgDefault = makeStyle(ANSI.FG.Default);

// x Background colors
// -------------------

export const bgBlack = makeStyle(ANSI.BG.Black);
export const bgRed = makeStyle(ANSI.BG.Red);
export const bgGreen = makeStyle(ANSI.BG.Green);
export const bgYellow = makeStyle(ANSI.BG.Yellow);
export const bgBlue = makeStyle(ANSI.BG.Blue);
export const bgMagenta = makeStyle(ANSI.BG.Magenta);
export const bgCyan = makeStyle(ANSI.BG.Cyan);
export const bgWhite = makeStyle(ANSI.BG.White);
export const bgBrightBlack = makeStyle(ANSI.BG.BrightBlack);
export const bgBrightRed = makeStyle(ANSI.BG.BrightRed);
export const bgBrightGreen = makeStyle(ANSI.BG.BrightGreen);
export const bgBrightYellow = makeStyle(ANSI.BG.BrightYellow);
export const bgBrightBlue = makeStyle(ANSI.BG.BrightBlue);
export const bgBrightMagenta = makeStyle(ANSI.BG.BrightMagenta);
export const bgBrightCyan = makeStyle(ANSI.BG.BrightCyan);
export const bgBrightWhite = makeStyle(ANSI.BG.BrightWhite);

// x Special foreground colors and effects
// -------------------

export const rgb = (r: number, g: number, b: number, text?: string): string => {
    const colorCode = ANSI.FG.RGB(r, g, b);
    return text === undefined ? colorCode : `${colorCode}${text}${ANSI.STYLE.reset}`;
}

/**
 * Renders text with one of the 256 ANSI colors.
 * @param n The color index (0-255) to use for the foreground color.
 * @param text The text to style. If omitted, the function returns the ANSI code for the specified color, allowing for composition with other styles.
 */
export const color256 = (n: number, text?: string): string => {
    const colorCode = ANSI.FG["256"](n);
    return text === undefined ? colorCode : `${colorCode}${text}${ANSI.STYLE.reset}`;
}

/**
 * Renders a string with a rainbow gradient effect.
 * **Note!** Some terminals may not support 24-bit RGB colors, which can result in the rainbow effect not displaying correctly. In such cases, consider using the `rainbow16` function for better compatibility, as it uses a limited set of 16 colors that are widely supported across different terminal emulators.
 */
export const rainbow = (text: string): string => {
    const hslToRgb = (h: number): [number, number, number] => {
        const s = 1, l = 0.5;
        const chroma = (1 - Math.abs(2 * l - 1)) * s;
        const x = chroma * (1 - Math.abs((h / 60) % 2 - 1));
        const m = l - chroma / 2;
        let r = 0, g = 0, b = 0;
        if (h < 60) { r = chroma; g = x; b = 0; }
        else if (h < 120) { r = x; g = chroma; b = 0; }
        else if (h < 180) { r = 0; g = chroma; b = x; }
        else if (h < 240) { r = 0; g = x; b = chroma; }
        else if (h < 300) { r = x; g = 0; b = chroma; }
        else { r = chroma; g = 0; b = x; }
        return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
    };

    return text.split('').map((char, i) => {
        const hue = (i / Math.max(text.length - 1, 1)) * 360;
        const [r, g, b] = hslToRgb(hue);
        return `${ANSI.FG.RGB(r, g, b)}${char}`;
    }).join('') + ANSI.STYLE.reset;
}

/**
 * Renders a string with a rainbow effect using a fixed set of 16 ANSI colors for better compatibility across different terminal emulators. This function cycles through the 16 colors in the ANSI palette to create a rainbow effect, which is more likely to display correctly in terminals that do not support 24-bit RGB colors.
 * @param text The string to render with the rainbow effect. Each character will be colored using one of the 16 ANSI colors in a repeating pattern.
 */
export const rainbow16 = (text: string): string => {
    const colors = [
        ANSI.FG.Red, ANSI.FG.BrightRed,
        ANSI.FG.Yellow, ANSI.FG.BrightYellow,
        ANSI.FG.Green, ANSI.FG.BrightGreen,
        ANSI.FG.Cyan, ANSI.FG.BrightCyan,
        ANSI.FG.Blue, ANSI.FG.BrightBlue,
        ANSI.FG.Magenta, ANSI.FG.BrightMagenta,
    ];
    return text.split('').map((char, i) => `${colors[i % colors.length]}${char}`).join('') + ANSI.STYLE.reset;
}

// x Styles
// -------------------

export const reset = ANSI.STYLE.reset;

/** Renders **bold** text. */
export const bold = makeStyle(ANSI.STYLE.bold);

/** Renders text with a dimmed appearance. */
export const dim = makeStyle(ANSI.STYLE.dim);

/** Render text in *italics*. */
export const italic = makeStyle(ANSI.STYLE.italic);

/** Renders text with an <u>underline</u>. */
export const underline = makeStyle(ANSI.STYLE.underline);

/**
 * Renders text with a blinking effect.
 * @deprecated Not widely supported and may not work in many terminals. Use with caution.
 */
export const blink = makeStyle(ANSI.STYLE.blink);

/** Renders text with inverse colors (background and foreground colors are swapped). */
export const inverse = makeStyle(ANSI.STYLE.inverse);

/**
 * Hides text from view while still occupying space in the layout.
 * @deprecated Note that this may not work in all terminals and can lead to unexpected results.
 */
export const hidden = makeStyle(ANSI.STYLE.hidden);

export const strikethrough = makeStyle(ANSI.STYLE.strikethrough);

/**
 * Default global logger singleton instance.
 * Appropriate for general use in most cases.
 */
export const logger = new ComfyLogger();
export const [
    log,
    addEventListener,
    configure,
] = [
        logger.log.bind(logger),
        logger.addEventListener.bind(logger),
        logger.configure.bind(logger),
    ];


export default {
    style,
    logger,
    ComfyLogger,
    log,
    addEventListener,
    configure,
    black,
    red,
    green,
    yellow,
    blue,
    magenta,
    cyan,
    white,
    fgDefault,
    brightBlack,
    brightRed,
    brightGreen,
    brightYellow,
    brightBlue,
    brightMagenta,
    brightCyan,
    brightWhite,
    bgBlack,
    bgRed,
    bgGreen,
    bgYellow,
    bgBlue,
    bgMagenta,
    bgCyan,
    bgWhite,
    bgBrightBlack,
    bgBrightRed,
    bgBrightGreen,
    bgBrightYellow,
    bgBrightBlue,
    bgBrightMagenta,
    bgBrightCyan,
    bgBrightWhite,
    bgDefault: ANSI.BG.Default,
    rgb,
    color256: color256,
    rainbow,
    rainbow16,
    bold,
    dim,
    italic,
    underline,
    blink,
    inverse,
    hidden,
    strikethrough,
    reset: ANSI.STYLE.reset,
    ANSI,
}

