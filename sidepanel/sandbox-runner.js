// Runs user code on behalf of the side panel.
// This file is loaded by sandbox.html which is declared in manifest.json
// under "sandbox" — giving it a relaxed CSP (allows new Function / eval)
// while blocking all chrome.* API access.

window.addEventListener('message', (event) => {
  if (event.data?.type !== 'RUN_CODE') return;

  const { code, tests } = event.data;
  const logs = [];
  const origLog = console.log;

  console.log = (...args) => {
    logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
  };

  let testResults = [];

  try {
    new Function(code)();

    (tests || []).forEach(test => {
      try {
        const actual   = new Function('return (' + test.input + ')')();
        const expected = new Function('return (' + test.expectedOutput + ')')();
        const pass = JSON.stringify(actual) === JSON.stringify(expected);
        testResults.push({
          description: test.description,
          pass,
          actual: JSON.stringify(actual),
          expected: JSON.stringify(expected),
        });
      } catch (e) {
        testResults.push({
          description: test.description,
          pass: false,
          actual: 'Error: ' + e.message,
          expected: test.expectedOutput,
        });
      }
    });
  } catch (e) {
    logs.push('Error: ' + e.message);
  }

  console.log = origLog;
  window.parent.postMessage({ type: 'RUN_RESULT', logs, testResults }, '*');
});
