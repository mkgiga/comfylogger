import { ComfyLogger, logger as globalLogger } from '../logger.js';

const customLogger = new ComfyLogger({
    tags: ['custom', 'example'],
});

function testLogging() {
    const tests = {
        "Calling log(string)": () => {
            customLogger.log("This is a message with a single string argument.");
            return true;
        },
        "Calling log(string[])": () => {
            customLogger.log("This is the first part of the message.", "And this is the second part.");
            return true;
        },
        "Calling log(template literal)": () => {
            const name = "Alice";
            customLogger.log(`Hello, ${name}!`);
            return true;
        },
        "Calling log`tagged template literal`": () => {
            const name = "Bob";
            customLogger.log`Hello, ${name}! This is a tagged template literal.`;
            return true;
        },
        // ... todo: add more tests
    }
}

testLogging();