import { ButtonDemo } from "@/components/examples/button-demo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ThemeToggleDropdown } from "@/components/ui/theme-toggle-dropdown";

export default function TestButtonPage() {
  return (
    <div className="min-h-screen bg-background transition-colors">
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-5xl font-bold text-primary mb-2">
              GateCtr Component Test
            </h1>
            <p className="text-foreground/70">
              Testing shadcn/ui components with GateCtr branding & dark mode
            </p>
          </div>
          <div className="flex gap-4 items-center">
            <ThemeToggle />
            <ThemeToggleDropdown />
          </div>
        </div>

        <div className="space-y-8">
          {/* Card de test pour le dark mode */}
          <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
            <h2 className="font-display text-2xl font-bold text-card-foreground mb-4">
              Dark Mode Test Card
            </h2>
            <p className="text-muted-foreground mb-4">
              Cette carte change automatiquement de couleur selon le thème
              sélectionné. Utilisez les boutons en haut à droite pour basculer
              entre light, dark et system mode.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-muted p-4 rounded-md">
                <p className="text-muted-foreground text-sm font-medium mb-2">
                  Muted
                </p>
                <p className="text-xs text-muted-foreground">
                  Background secondaire
                </p>
              </div>
              <div className="bg-accent p-4 rounded-md">
                <p className="text-accent-foreground text-sm font-medium mb-2">
                  Accent
                </p>
                <p className="text-xs text-accent-foreground/80">
                  Hover states, badges
                </p>
              </div>
              <div className="bg-primary p-4 rounded-md">
                <p className="text-primary-foreground text-sm font-medium mb-2">
                  Primary
                </p>
                <p className="text-xs text-primary-foreground/80">
                  Navy - Couleur principale
                </p>
              </div>
            </div>
          </div>

          {/* Composants Button */}
          <ButtonDemo />
        </div>
      </div>
    </div>
  );
}
