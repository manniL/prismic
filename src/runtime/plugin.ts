import { defineNuxtPlugin } from '#app'
import { createPrismic } from '@prismicio/vue'

import { name as pkgName } from '../../package.json'
import { PrismicModuleOptions } from '../types'

export default defineNuxtPlugin((nuxtApp) => {
	const mergedOptions: PrismicModuleOptions = nuxtApp.payload.config[pkgName]

	nuxtApp.vueApp.use(createPrismic(mergedOptions))
})