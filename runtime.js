/**
 * Oh-My-DSH runtime plugin.
 *
 * This module is mounted once per OMD agent preset. It owns that agent type's
 * prompt, tools, commands, hooks and skills. All durable state lives in the
 * project's `.omd/` directory; this module keeps only derived in-process
 * caches.
 */
export { apply, inject, name } from './src/runtime/index.js'
