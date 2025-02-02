import { join } from 'node:path'

import { defu } from 'defu'
import {
	defineNuxtModule,
	createResolver,
	addTemplate,
	addPlugin,
	addImports,
	addComponent,
	extendPages
} from '@nuxt/kit'

import * as prismicVue from '@prismicio/vue'

import { logger, fileExists } from './lib'
import type { PrismicModuleOptions } from './types'

// Options export
export type { PrismicModuleOptions } from './types'

declare module '@nuxt/schema' {
	interface PublicRuntimeConfig {
		prismic: PrismicModuleOptions
	}
}

// Module export
export default defineNuxtModule<PrismicModuleOptions>({
	meta: {
		name: '@nuxtjs/prismic',
		configKey: 'prismic',
		compatibility: { nuxt: '^3.0.0' }
	},
	defaults: nuxt => ({
		endpoint: '',
		clientConfig: {},
		client: '~/app/prismic/client',
		linkResolver: '~/app/prismic/linkResolver',
		richTextSerializer: '~/app/prismic/richTextSerializer',
		injectComponents: true,
		components: {},
		preview: '/preview',
		toolbar: true
	}),
	hooks: {},
	setup (options, nuxt) {
		// Expose options through public runtime config
		nuxt.options.runtimeConfig.public ||= {} as typeof nuxt.options.runtimeConfig.public
		const moduleOptions: PrismicModuleOptions = defu(nuxt.options.runtimeConfig.public.prismic, options)
		nuxt.options.runtimeConfig.public.prismic = moduleOptions

		if (!moduleOptions.endpoint) {
			logger.warn('Options `endpoint` is required, disabling module...')
			return
		}

		// Runtime dir boilerplate
		const resolver = createResolver(import.meta.url)
		nuxt.options.build.transpile.push(resolver.resolve('runtime'), '@nuxtjs/prismic', '@prismicio/vue')
		nuxt.options.vite.optimizeDeps ||= {}
		nuxt.options.vite.optimizeDeps.exclude ||= []
		nuxt.options.vite.optimizeDeps.exclude.push('@prismicio/vue')

		// Add runtime user code
		const proxyUserFileWithUndefinedFallback = (filename: string, path: string, extensions = ['js', 'mjs', 'ts']) => {
			const resolvedFilename = `prismic/proxy/${filename}.ts`
			const resolvedPath = path.replace(/^(~~|@@)/, nuxt.options.rootDir).replace(/^(~|@)/, nuxt.options.srcDir)
			const maybeUserFile = fileExists(resolvedPath, extensions)

			if (maybeUserFile) {
				// If user file exists, proxy it with vfs
				logger.info(`Using user-defined \`${filename}\` at \`${maybeUserFile.replace(nuxt.options.srcDir, '~').replace(nuxt.options.rootDir, '~~').replace(/\\/g, '/')}\``)

				addTemplate({
					filename: resolvedFilename,
					getContents: () => `export { default } from '${path}'`
				})
			} else {
				// Else provide `undefined` fallback
				addTemplate({
					filename: resolvedFilename,
					getContents: () => 'export default undefined'
				})
			}
		}
		proxyUserFileWithUndefinedFallback('client', moduleOptions.client!)
		proxyUserFileWithUndefinedFallback('linkResolver', moduleOptions.linkResolver!)
		proxyUserFileWithUndefinedFallback('richTextSerializer', moduleOptions.richTextSerializer!)

		// Add plugin
		addPlugin(resolver.resolve('runtime/plugin'))
		addPlugin(resolver.resolve('runtime/plugin.client'))

		// Add components auto import
		if (moduleOptions.injectComponents) {
			[
				'PrismicEmbed',
				'PrismicImage',
				'PrismicLink',
				'PrismicText',
				'PrismicRichText',
				'SliceZone'
			].forEach((component) => {
				addComponent({
					name: component,
					export: component,
					filePath: '@prismicio/vue'
				})
			})
		}

		// Add auto imports
		const prismicVueAutoImports = Object
			.keys(prismicVue)
			.filter(key => key.startsWith('use'))
			.concat('getSliceComponentProps', 'defineSliceZoneComponents')
			.map((key) => {
				return {
					name: key,
					as: key,
					from: '@prismicio/vue'
				}
			})
		addImports(prismicVueAutoImports)
		addImports({
			name: 'usePrismicPreview',
			as: 'usePrismicPreview',
			from: resolver.resolve('runtime/usePrismicPreview')
		})

		// Add preview route
		if (moduleOptions.preview) {
			const maybeUserPreviewPage = fileExists(join(nuxt.options.srcDir, nuxt.options.dir.pages, moduleOptions.preview), ['js', 'ts', 'vue'])

			if (maybeUserPreviewPage) {
				logger.info(`Using user-defined preview page at \`${maybeUserPreviewPage.replace(join(nuxt.options.srcDir), '~').replace(nuxt.options.rootDir, '~~').replace(/\\/g, '/')
				}\`, available at \`${moduleOptions.preview}\``)
			} else {
				logger.info(`Using default preview page, available at \`${moduleOptions.preview}\``)

				extendPages((pages) => {
					pages.unshift({
						name: 'prismic-preview',
						path: moduleOptions.preview as string, // Checked before
						file: resolver.resolve('runtime/preview.vue')
					})
				})
			}

			if (!moduleOptions.toolbar) {
				logger.warn('`toolbar` option is disabled but `preview` is enabled. Previews won\'t work unless you manually load the toolbar.')
			}
		}
	}
})
