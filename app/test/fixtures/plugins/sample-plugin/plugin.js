// Sample plugin for the Plugin SDK tests — registers one tool, one skill,
// one agent, and one provider on the SDK instance it receives.

module.exports = function samplePlugin(sdk) {
  sdk.registerTool('sample_greet', {
    description: 'Say hello from the sample plugin.',
    run: ({ name } = {}) => `Hello, ${name || 'world'}! (from sample plugin)`,
  })

  sdk.registerSkill('sample-skill', {
    description: 'A test skill registered by the sample plugin.',
    body: '# Sample Skill\nDoes nothing much.',
  })

  sdk.registerAgent('sample-agent', {
    description: 'A test agent preset.',
    systemPrompt: 'You are the sample agent.',
  })

  sdk.registerProvider('sample-provider', {
    apiFormat: 'openai',
    apiUrl: 'https://sample.example.com/v1',
    key: 'sk-sample',
    models: ['sample-model'],
  })
}