'use client';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Logo } from '@/components/shared/logo';
import { Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useUser, useClerk } from '@clerk/nextjs';
import { useActiveTeam } from '@/hooks/use-active-team';
import {
  LayoutDashboard,
  LineChart,
  Boxes,
  KeySquare,
  ShieldCheck,
  Zap,
  Receipt,
  SlidersHorizontal,
  ChevronsUpDown,
  LogOut,
  UserRound,
  Plus,
  Check,
} from 'lucide-react';

// ─── Nav items ────────────────────────────────────────────────────────────────

const MAIN_NAV = [
  { key: 'dashboard', href: '/dashboard', icon: LayoutDashboard },
  { key: 'analytics', href: '/analytics', icon: LineChart },
  { key: 'projects',  href: '/projects',  icon: Boxes },
  { key: 'apiKeys',   href: '/api-keys',  icon: KeySquare },
  { key: 'budget',    href: '/budget',    icon: ShieldCheck },
  { key: 'webhooks',  href: '/webhooks',  icon: Zap },
] as const;

const SECONDARY_NAV = [
  { key: 'billing',  href: '/billing',  icon: Receipt },
  { key: 'settings', href: '/settings', icon: SlidersHorizontal },
] as const;

// ─── Team Switcher ────────────────────────────────────────────────────────────

function TeamSwitcher() {
  const t = useTranslations('dashboard.sidebar');
  const { activeTeam, isLoading, teams, switchTeam } = useActiveTeam();

  const orgName = activeTeam?.name ?? '…';
  const planLabel = activeTeam?.plan?.toLowerCase() ?? 'free';
  const initials = orgName === '…' ? '…' : orgName.slice(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          {/* Avatar workspace */}
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold shrink-0 select-none">
            {isLoading ? '…' : initials}
          </div>
          <div className="flex flex-col gap-0.5 leading-none min-w-0">
            <span className="font-semibold text-sm truncate">
              {isLoading ? t('loading') : orgName}
            </span>
            <span className="text-[11px] text-muted-foreground truncate capitalize">
              {planLabel} {t('plan')}
            </span>
          </div>
          <ChevronsUpDown className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-60" align="start" side="bottom" sideOffset={6}>
        <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-2 py-1.5">
          {t('workspaces')}
        </DropdownMenuLabel>
        {teams.map((team) => (
          <DropdownMenuItem
            key={team.id}
            onClick={() => switchTeam(team.id)}
            className="gap-2.5"
          >
            <div className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary text-[10px] font-bold shrink-0">
              {team.name.slice(0, 2).toUpperCase()}
            </div>
            <span className="truncate flex-1">{team.name}</span>
            {activeTeam?.id === team.id && (
              <Check className="size-3.5 text-primary shrink-0" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2.5 text-muted-foreground">
          <div className="flex size-6 items-center justify-center rounded-md border border-dashed border-muted-foreground/40 shrink-0">
            <Plus className="size-3" />
          </div>
          {t('newWorkspace')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── User Menu ────────────────────────────────────────────────────────────────

function UserMenu() {
  const t = useTranslations('dashboard.sidebar');
  const { user } = useUser();
  const { signOut } = useClerk();

  const name = user?.fullName ?? user?.firstName ?? 'User';
  const email = user?.primaryEmailAddress?.emailAddress ?? '';
  const avatar = user?.imageUrl;
  const initials = name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <Avatar className="size-7 shrink-0">
            <AvatarImage src={avatar} alt={name} />
            <AvatarFallback className="text-[11px] font-semibold">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-0.5 leading-none min-w-0">
            <span className="font-medium text-sm truncate">{name}</span>
            <span className="text-[11px] text-muted-foreground truncate">{email}</span>
          </div>
          <ChevronsUpDown className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-60" align="start" side="top" sideOffset={6}>
        <div className="flex items-center gap-2.5 px-2 py-2">
          <Avatar className="size-8 shrink-0">
            <AvatarImage src={avatar} alt={name} />
            <AvatarFallback className="text-xs font-semibold">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-medium truncate">{name}</span>
            <span className="text-[11px] text-muted-foreground truncate">{email}</span>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="gap-2.5">
          <Link href="/settings">
            <UserRound className="size-4 text-muted-foreground" />
            {t('profile')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          className="gap-2.5"
          onClick={() => signOut({ redirectUrl: '/' })}
        >
          <LogOut className="size-4" />
          {t('signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────

export function DashboardSidebar() {
  const t = useTranslations('dashboard.sidebar');
  const pathname = usePathname();

  const cleanPath = pathname.replace(/^\/fr/, '') || '/';

  return (
    <Sidebar collapsible="icon">
      {/* Header */}
      <SidebarHeader className="border-b border-sidebar-border pb-0">
        {/* Logo — full in expanded, icon-only when collapsed */}
        <div className="flex h-14 items-center px-3">
          <div className="group-data-[collapsible=icon]:hidden">
            <Logo variant="full" iconClassName="w-6 h-6" textClassName="text-xl" />
          </div>
          <div className="hidden group-data-[collapsible=icon]:flex items-center justify-center w-full">
            <Logo variant="icon" iconClassName="w-6 h-6" />
          </div>
        </div>

        {/* Team switcher */}
        <SidebarMenu className="px-1 pb-2">
          <SidebarMenuItem>
            <TeamSwitcher />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* Content — no visible scrollbar */}
      <SidebarContent className="overflow-y-auto overflow-x-hidden scrollbar-none">
        {/* Main nav */}
        <SidebarGroup className="pt-3">
          <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-3 mb-1">
            {t('main')}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {MAIN_NAV.map(({ key, href, icon: Icon }) => {
                const isActive =
                  cleanPath === href ||
                  (href !== '/dashboard' && cleanPath.startsWith(href));
                return (
                  <SidebarMenuItem key={key}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={t(key)}
                      className="gap-3 rounded-lg"
                    >
                      <Link href={href}>
                        <Icon className="size-4 shrink-0" />
                        <span className="text-sm">{t(key)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="mx-3 my-1" />

        {/* Account nav */}
        <SidebarGroup className="pb-3">
          <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-3 mb-1">
            {t('account')}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {SECONDARY_NAV.map(({ key, href, icon: Icon }) => (
                <SidebarMenuItem key={key}>
                  <SidebarMenuButton
                    asChild
                    isActive={cleanPath.startsWith(href)}
                    tooltip={t(key)}
                    className="gap-3 rounded-lg"
                  >
                    <Link href={href}>
                      <Icon className="size-4 shrink-0" />
                      <span className="text-sm">{t(key)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer — user menu + collapse trigger */}
      <SidebarFooter className="border-t border-sidebar-border pt-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu />
          </SidebarMenuItem>
        </SidebarMenu>
        {/* Collapse trigger — desktop only, positioned at bottom like Linear/Vercel */}
        <div className="hidden md:flex items-center justify-end px-1 pb-1">
          <SidebarTrigger className="size-7 text-muted-foreground/50 hover:text-muted-foreground" />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
