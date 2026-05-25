export type Action = 'write' | 'conflict' | 'safe-overwrite' | 'user-modified'
export interface FileState {
  exists: boolean
  tracked: boolean
  hashMatches: boolean
}

export function decideAction(s: FileState): Action {
  if (!s.exists) return 'write'
  if (!s.tracked) return 'conflict'
  return s.hashMatches ? 'safe-overwrite' : 'user-modified'
}
