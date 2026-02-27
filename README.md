# comfylogger

A stupidly easy and comfortable logging utility for ts/js

## Usage

```js
// import the default, built-in logger
import { logger } from 'comfylogger';

// Print colored text
import { red } from 'comfylogger';
logger.log(red("This text is red."));

// Use multiple styles
import { cyan, bold, underline } from 'comfylogger';
logger.log(cyan(bold(underline("Hello world!"))));

// Use tagged template literals
import { cyan, brightGreen } from 'comfylogger';
logger.log`${cyan`This is cyan`} and ${brightGreen`this is bright green`}.`;

// Create a custom logger instance
import { ComfyLogger } from 'comfylogger';

// Create a custom logger instance with specific name and tags
const customLogger = new ComfyLogger({
    name: "debug",
    tags: ["debug", "custom"],
});

// Use the custom logger
customLogger.log("This is a message from the custom logger.");

// Create a custom style
import { style, bold, italics, brightBlue } from 'comfylogger';

const coolStyle = style(text => brightBlue(bold(italics(text))));
logger.log(coolStyle("This text is bright blue, bold, and italicized!"));

```
