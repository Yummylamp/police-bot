const js = require('@eslint/js');

module.exports = [
	js.configs.recommended,
	{
		languageOptions: {
			ecmaVersion: 'latest',
		},
		rules: {
			semi: ['error', 'always'],
			quotes: ['error', 'single'],
			'prefer-const': 'error',
			'no-console': 'off',
			indent: ['error', 'tab'],
		},
	},
];