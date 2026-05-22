import type { AppState } from '@/store/types'
import { parseWslUncPath } from '../../../shared/wsl-paths'

export type LocalPreflightContext = { wslDistro?: string | null; wslDefault?: boolean } | undefined

export function getWslDistroFromPath(path?: string | null): string | null {
  return path ? (parseWslUncPath(path)?.distro ?? null) : null
}

export function getLocalPreflightContext(state: AppState): LocalPreflightContext {
  const wslDistro = getLocalPreflightWslDistro(state)
  return wslDistro ? { wslDistro } : undefined
}

export function getLocalAgentPreflightContext(state: AppState): LocalPreflightContext {
  const wslDistro = getLocalPreflightWslDistro(state)
  if (wslDistro) {
    return { wslDistro }
  }
  if (state.settings?.terminalWindowsShell === 'wsl.exe') {
    return { wslDefault: true }
  }
  return undefined
}

function getLocalPreflightWslDistro(state: AppState): string | null {
  const activeWorktree = state.activeWorktreeId
    ? Object.values(state.worktreesByRepo ?? {})
        .flat()
        .find((worktree) => worktree.id === state.activeWorktreeId)
    : null
  const activePath =
    activeWorktree?.path ?? (state.repos ?? []).find((repo) => repo.id === state.activeRepoId)?.path
  return getWslDistroFromPath(activePath)
}

export function localPreflightContextKey(context: LocalPreflightContext): string {
  if (context?.wslDistro) {
    return `wsl:${context.wslDistro}`
  }
  return context?.wslDefault ? 'wsl:default' : 'host'
}
