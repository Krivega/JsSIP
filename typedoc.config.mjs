/**
 * Configuration for Typedoc.
 */

/** @type {Partial<import('typedoc').TypeDocOptions>} */
const config = {
	entryPoints: [
		'src/JsSIP.d.ts',
		'src/Message.d.ts',
		'src/Notifier.d.ts',
		'src/Subscriber.d.ts',
		'src/Transport.ts',
	],
	out: 'docs',
	skipErrorChecking: false,
	exclude: ['src/test/**/test-*.ts'],
	excludePrivate: true,
	excludeProtected: true,
	excludeNotDocumented: false,
	excludeInternal: true,
	excludeExternals: true,
	includeVersion: true,
	gitRemote: 'origin',
	hideGenerator: false,
	treatWarningsAsErrors: true,
	cacheBust: true,
	categorizeByGroup: false,
	categoryOrder: ['Config', 'UA', 'RTCSession', '*'],
	searchInComments: true,
	readme: 'README.md',
	projectDocuments: ['README.md', 'LICENSE.md'],
	navigationLinks: {
		GitHub: 'https://github.com/versatica/jssip',
		NPM: 'https://www.npmjs.com/package/jssip',
	},
	customCss: './docs-assets/custom-styles.css',
};

export default config;
