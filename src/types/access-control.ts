// src/types/access-control.ts
// Type definitions for the Access Control (IAM) module.

// ── Roles ─────────────────────────────────────────────────────

export type SystemRole = 'admin' | 'supervisor' | 'operador' | 'visualizador'
export type LegacyRole = 'maintenance' | 'operations' | 'purchasing'
export type AnyRole    = SystemRole | LegacyRole

export const SYSTEM_ROLES: SystemRole[] = ['admin', 'supervisor', 'operador', 'visualizador']

export const ROLE_META: Record<AnyRole, { label: string; color: string; bg: string; level: number }> = {
  admin:        { label: 'Administrador', color: '#2563eb', bg: '#eff6ff', level: 4 },
  supervisor:   { label: 'Supervisor',    color: '#7c3aed', bg: '#f5f3ff', level: 3 },
  operador:     { label: 'Operador',      color: '#166534', bg: '#f0fdf4', level: 2 },
  visualizador: { label: 'Visualizador',  color: '#475569', bg: '#f8fafc', level: 1 },
  maintenance:  { label: 'Manutenção ⚠',  color: '#92400e', bg: '#fffbeb', level: 3 },
  operations:   { label: 'Operações ⚠',   color: '#92400e', bg: '#fffbeb', level: 2 },
  purchasing:   { label: 'Compras ⚠',     color: '#92400e', bg: '#fffbeb', level: 3 },
}

// ── User ──────────────────────────────────────────────────────

export interface SystemUser {
  uid:        string
  nome:       string
  email:      string
  accessCode: string
  role:       AnyRole
  cargo?:     string
  active?:    boolean   // undefined = active
  blocked?:   boolean   // undefined = not blocked
  lastLogin?: Date | null
  lastSeen?:  Date | null
  createdAt?: Date | null
}

export function isUserActive(u: SystemUser): boolean {
  return u.active !== false && !u.blocked
}

export function isUserBlocked(u: SystemUser): boolean {
  return u.blocked === true
}

// ── User Creation Payload ─────────────────────────────────────

export interface CreateUserPayload {
  nome:            string
  accessCode:      string   // uppercase, unique
  email:           string   // auto-generated from accessCode
  role:            SystemRole
  cargo?:          string
  initialPassword: string
}

// ── Access Log ────────────────────────────────────────────────

export type AccessLogAction =
  | 'user_created'
  | 'user_deleted'
  | 'user_activated'
  | 'user_deactivated'
  | 'user_blocked'
  | 'user_unblocked'
  | 'role_changed'

export const LOG_ACTION_META: Record<AccessLogAction, { label: string; icon: string; color: string }> = {
  user_created:    { label: 'Usuário criado',        icon: '➕', color: '#16a34a' },
  user_deleted:    { label: 'Usuário removido',       icon: '🗑️', color: '#dc2626' },
  user_activated:  { label: 'Acesso ativado',         icon: '✅', color: '#16a34a' },
  user_deactivated:{ label: 'Acesso desativado',      icon: '🚫', color: '#ea580c' },
  user_blocked:    { label: 'Usuário bloqueado',      icon: '🔒', color: '#dc2626' },
  user_unblocked:  { label: 'Bloqueio removido',      icon: '🔓', color: '#16a34a' },
  role_changed:    { label: 'Papel alterado',         icon: '🔄', color: '#2563eb' },
}

export interface AccessLog {
  id:               string
  action:           AccessLogAction
  userId:           string
  userName:         string
  userAccessCode:   string
  performedBy:      string
  performedByName:  string
  timestamp:        Date
  details?:         Record<string, string>
}

// ── Permission Matrix ─────────────────────────────────────────

export type PermLevel = 'full' | 'write' | 'limited' | 'read' | 'none'

export const PERM_META: Record<PermLevel, { label: string; color: string; bg: string; short: string }> = {
  full:    { label: 'CRUD Completo', color: '#166534', bg: '#f0fdf4', short: 'CRUD'    },
  write:   { label: 'Criar + Editar', color: '#2563eb', bg: '#eff6ff', short: 'Editar'  },
  limited: { label: 'Acesso Limitado',color: '#ea580c', bg: '#fff7ed', short: 'Limitado'},
  read:    { label: 'Somente Leitura',color: '#475569', bg: '#f8fafc', short: 'Leitura' },
  none:    { label: 'Sem Acesso',     color: '#dc2626', bg: '#fef2f2', short: '—'       },
}

export interface ModulePermission {
  module:       string
  label:        string
  icon:         string
  admin:        PermLevel
  supervisor:   PermLevel
  operador:     PermLevel
  visualizador: PermLevel
  note?:        string
}

export const PERMISSION_MATRIX: ModulePermission[] = [
  { module: 'dashboard',     label: 'Dashboard Executivo',  icon: '📊', admin: 'full', supervisor: 'none',    operador: 'none',    visualizador: 'none',  note: 'Restrito a administradores' },
  { module: 'acesso',        label: 'Controle de Acesso',   icon: '🔐', admin: 'full', supervisor: 'none',    operador: 'none',    visualizador: 'none',  note: 'Somente admins' },
  { module: 'ativos',        label: 'Ativos & Inventário',  icon: '🏭', admin: 'full', supervisor: 'full',    operador: 'limited', visualizador: 'read',  note: 'Operador não altera código/categoria' },
  { module: 'manutencao',    label: 'Manutenção',            icon: '🔧', admin: 'full', supervisor: 'full',    operador: 'write',   visualizador: 'read' },
  { module: 'os',            label: 'Ordens de Serviço',    icon: '📋', admin: 'full', supervisor: 'full',    operador: 'write',   visualizador: 'read',  note: 'Operador não muda status/prioridade' },
  { module: 'compras',       label: 'Compras',               icon: '🛒', admin: 'full', supervisor: 'full',    operador: 'limited', visualizador: 'read',  note: 'Operador não aprova pedidos' },
  { module: 'frota',         label: 'Frota',                 icon: '🚛', admin: 'full', supervisor: 'full',    operador: 'write',   visualizador: 'read' },
  { module: 'limpeza',       label: 'Limpeza 5S',            icon: '🧹', admin: 'full', supervisor: 'full',    operador: 'write',   visualizador: 'read' },
  { module: 'seguranca',     label: 'Segurança do Trabalho', icon: '🦺', admin: 'full', supervisor: 'full',    operador: 'write',   visualizador: 'read' },
  { module: 'colaboradores', label: 'Colaboradores',         icon: '👥', admin: 'full', supervisor: 'full',    operador: 'limited', visualizador: 'read',  note: 'Operador não altera dados pessoais' },
  { module: 'obras',         label: 'Obras & Empreiteiras',  icon: '🏗️', admin: 'full', supervisor: 'full',    operador: 'write',   visualizador: 'read' },
  { module: 'documentos',    label: 'Documentos',            icon: '📄', admin: 'full', supervisor: 'write',   operador: 'none',    visualizador: 'read' },
]
