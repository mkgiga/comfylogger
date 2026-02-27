import { ComfyLogger, logger as globalLogger } from '../logger.js';

const customLogger = new ComfyLogger({
    tags: ['custom', 'example'],
});

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

function runTests() {
    let passed = 0;
    let failed = 0;
    
    for (const [testName, testFunc] of Object.entries(tests)) {
        try {
            const result = testFunc();
            console.log(`${result ? '✅' : '❌'} "${testName}"`);
            if (result) {
                passed++;
            } else {
                failed++;
            }
        } catch (error) {
            console.error(`"${testName}": ERROR -`, error);
            failed++;
        }
    }

    console.log();
    console.log(`-------- Test Results --------`);
    console.log();
    console.log(`- Total tests: ${passed + failed}`);
    console.log(`- Passed: ${passed}`);
    console.log(`- Failed: ${failed}`);
    console.log();
    console.log(`------------------------------`);

}

runTests();