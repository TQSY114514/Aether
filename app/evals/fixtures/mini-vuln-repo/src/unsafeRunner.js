const { execSync } = require('child_process')

function runUserDiagnostics(userInput, db) {
  // 1. Command injection candidate (verified via static source trace)
  const out = execSync(`ping -c 1 ${userInput}`)
  // 2. SQL injection candidate (verified via static source trace)
  const row = db.prepare(`SELECT * FROM users WHERE name = ${userInput}`).get()
  // 3. Dynamic code execution candidate (requires sandbox execution -> needs_validation without Docker/OS sandbox)
  const dyn = eval(userInput)
  return { out, row, dyn }
}

module.exports = { runUserDiagnostics }
