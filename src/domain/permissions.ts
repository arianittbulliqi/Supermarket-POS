/**
 * Who may do what. A cashier sells; a supervisor fixes mistakes at the till
 * (discounts, voids, returns) and receives goods; a manager runs the store.
 *
 * When a cashier needs something above their role, the till asks for a
 * supervisor's PIN on the spot instead of sending them to another screen.
 */
import type { Role } from './types';

export type Action =
  | 'sell'
  | 'reprint'
  | 'close_shift'
  | 'discount'
  | 'void_line'
  | 'clear_cart'
  | 'return'
  | 'cash_move'
  | 'price_override'
  | 'stock.view'
  | 'stock.receive'
  | 'stock.adjust'
  | 'products.edit'
  | 'reports.view'
  | 'users.manage'
  | 'settings.edit';

const CASHIER: Action[] = ['sell', 'reprint', 'close_shift', 'stock.view'];
const SUPERVISOR: Action[] = [...CASHIER, 'discount', 'void_line', 'clear_cart', 'return', 'cash_move', 'price_override', 'stock.receive', 'stock.adjust', 'reports.view'];
const MANAGER: Action[] = [...SUPERVISOR, 'products.edit', 'users.manage', 'settings.edit'];

const RIGHTS: Record<Role, ReadonlySet<Action>> = {
  cashier: new Set(CASHIER),
  supervisor: new Set(SUPERVISOR),
  manager: new Set(MANAGER),
};

export const can = (role: Role | null | undefined, action: Action): boolean => !!role && RIGHTS[role].has(action);

/** Actions a supervisor can approve for a cashier at the till. */
export const APPROVABLE: ReadonlySet<Action> = new Set(['discount', 'void_line', 'clear_cart', 'return', 'cash_move', 'price_override']);

export const ROLES: Role[] = ['cashier', 'supervisor', 'manager'];
export const ROLE_LABEL: Record<Role, string> = { cashier: 'Cashier', supervisor: 'Supervisor', manager: 'Manager' };
export const ROLE_DETAIL: Record<Role, string> = {
  cashier: 'Sells and closes their own shift.',
  supervisor: 'Also gives discounts, voids lines, takes returns, receives and adjusts stock, sees reports.',
  manager: 'Everything, including prices, products, staff and settings.',
};
