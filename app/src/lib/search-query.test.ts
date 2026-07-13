import { describe, expect, it } from 'vitest'
import { parseSearchInput, suggestSearchCompletions } from './search-query'

describe('parseSearchInput', () => {
  it('returns no clause for empty and whitespace-only input', () => {
    expect(parseSearchInput('')).toEqual({ scope: null, clause: null })
    expect(parseSearchInput('   ')).toEqual({ scope: null, clause: null })
  })

  it('turns a single word into a name prefix glob', () => {
    expect(parseSearchInput('web')).toEqual({ scope: null, clause: 'name=web*' })
  })

  it('keeps an explicit trailing glob as typed', () => {
    expect(parseSearchInput('web*')).toEqual({ scope: null, clause: 'name=web*' })
    expect(parseSearchInput('*web*')).toEqual({ scope: null, clause: 'name=*web*' })
  })

  it('passes multi-word input through as engine free text', () => {
    expect(parseSearchInput('web server')).toEqual({ scope: null, clause: 'web server' })
  })

  it('passes key=value DSL through verbatim', () => {
    expect(parseSearchInput('status=up')).toEqual({ scope: null, clause: 'status=up' })
    expect(parseSearchInput('cluster=Default and status=up')).toEqual({
      scope: null,
      clause: 'cluster=Default and status=up',
    })
  })

  it('detects type scopes and re-parses the remainder', () => {
    expect(parseSearchInput('vm:web')).toEqual({ scope: 'vms', clause: 'name=web*' })
    expect(parseSearchInput('host:node1')).toEqual({ scope: 'hosts', clause: 'name=node1*' })
    expect(parseSearchInput('vm:status=up')).toEqual({ scope: 'vms', clause: 'status=up' })
  })

  it('resolves scope aliases case-insensitively', () => {
    expect(parseSearchInput('SD:iso').scope).toBe('storageDomains')
    expect(parseSearchInput('dc:Default').scope).toBe('dataCenters')
    expect(parseSearchInput('net:ovirtmgmt').scope).toBe('networks')
    expect(parseSearchInput('Template:base').scope).toBe('templates')
    expect(parseSearchInput('CLUSTER:prod').scope).toBe('clusters')
  })

  it('yields a scope with no clause for a bare scope prefix', () => {
    expect(parseSearchInput('vm:')).toEqual({ scope: 'vms', clause: null })
    expect(parseSearchInput('vm:  ')).toEqual({ scope: 'vms', clause: null })
  })

  it('treats an unknown prefix before a colon as plain text', () => {
    expect(parseSearchInput('foo:bar')).toEqual({ scope: null, clause: 'name=foo:bar*' })
  })

  it('does not scope a leading colon', () => {
    expect(parseSearchInput(':web')).toEqual({ scope: null, clause: 'name=:web*' })
  })
})

describe('suggestSearchCompletions', () => {
  const tokens = (raw: string) => suggestSearchCompletions(raw).map((s) => s.token)

  it('leaves plain-text and nav modes untouched', () => {
    expect(suggestSearchCompletions('')).toEqual([])
    expect(suggestSearchCompletions('web')).toEqual([])
    expect(suggestSearchCompletions('web server')).toEqual([])
    // a partial that happens to prefix a field is still plain text without scope
    expect(suggestSearchCompletions('sta')).toEqual([])
  })

  it('offers a collection field list right after a type scope', () => {
    const t = tokens('vm:')
    expect(t).toContain('name')
    expect(t).toContain('status')
    // vms has far more than 8 fields, so the list is capped at exactly
    // SUGGESTION_LIMIT (8) — pin the cap, not just an upper bound.
    expect(t.length).toBe(8)
    expect(suggestSearchCompletions('vm:').every((s) => s.kind === 'field')).toBe(true)
  })

  it('narrows fields by prefix and inserts the whole scoped value', () => {
    expect(suggestSearchCompletions('vm:sta')).toEqual([
      { kind: 'field', token: 'status', value: 'vm:status' },
    ])
  })

  it('uses the scoped collection, not VMs, for field names', () => {
    expect(tokens('net:vl')).toEqual(['vlanid'])
    expect(tokens('host:active')).toEqual(['active_vms'])
  })

  it('advances to operators once a whole field is typed', () => {
    expect(suggestSearchCompletions('vm:status')).toEqual([
      { kind: 'operator', token: '=', value: 'vm:status=' },
      { kind: 'operator', token: '!=', value: 'vm:status!=' },
    ])
  })

  it('offers ordering relations only for numeric fields', () => {
    expect(tokens('vm:name')).toEqual(['=', '!='])
    expect(tokens('vm:cpu_usage')).toEqual(['=', '!=', '>', '<', '>=', '<='])
  })

  it('suggests status enum values after the operator', () => {
    expect(tokens('vm:status=')).toContain('up')
    expect(tokens('vm:status=')).toContain('powering_up')
    expect(suggestSearchCompletions('vm:status=pa')).toEqual([
      { kind: 'value', token: 'paused', value: 'vm:status=paused' },
    ])
  })

  it('scopes status values to the collection', () => {
    expect(tokens('host:status=non')).toEqual(['non_operational', 'non_responsive'])
    expect(tokens('storage:status=de')).toEqual(['detaching'])
  })

  it('only the status field carries value completions', () => {
    expect(suggestSearchCompletions('vm:cluster=Def')).toEqual([])
    expect(suggestSearchCompletions('vm:name=web')).toEqual([])
  })

  it('engages in scopeless DSL mode via a relational operator, defaulting to VMs', () => {
    expect(tokens('status=')).toContain('up')
    // a bare field prefix without an operator is still plain text
    expect(suggestSearchCompletions('status')).toEqual([])
  })

  it('completes the trailing condition across boolean joiners', () => {
    expect(suggestSearchCompletions('vm:status=up and clu')).toEqual([
      { kind: 'field', token: 'cluster', value: 'vm:status=up and cluster' },
    ])
  })

  it('matches scopes and fields case-insensitively but normalizes the inserted token', () => {
    expect(suggestSearchCompletions('VM:STA')).toEqual([
      { kind: 'field', token: 'status', value: 'VM:status' },
    ])
  })

  it('does not echo a token that is already complete', () => {
    expect(suggestSearchCompletions('vm:status=up')).toEqual([])
    expect(suggestSearchCompletions('net:vlanid')).toEqual([
      { kind: 'operator', token: '=', value: 'net:vlanid=' },
      { kind: 'operator', token: '!=', value: 'net:vlanid!=' },
      { kind: 'operator', token: '>', value: 'net:vlanid>' },
      { kind: 'operator', token: '<', value: 'net:vlanid<' },
      { kind: 'operator', token: '>=', value: 'net:vlanid>=' },
      { kind: 'operator', token: '<=', value: 'net:vlanid<=' },
    ])
  })
})
