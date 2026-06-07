"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Calendar, DollarSign, Users, TrendingUp } from "lucide-react"
import { useTranslation } from "@/lib/i18n/context"

export default function WelcomeScreen({ onContinue }: { onContinue: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-primary to-orange-600 shadow-lg">
            <Calendar className="h-10 w-10 text-white" strokeWidth={1.5} />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-balance">Crewlly</h1>
          <p className="text-lg text-muted-foreground text-balance leading-relaxed">
            {t("onboarding_welcome_subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4 space-y-2 bg-white/60 backdrop-blur-sm border-primary/10">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-primary" strokeWidth={1.5} />
            </div>
            <h3 className="font-semibold text-sm">{t("onboarding_welcome_feature_shifts")}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{t("onboarding_welcome_feature_shifts_desc")}</p>
          </Card>

          <Card className="p-4 space-y-2 bg-white/60 backdrop-blur-sm border-primary/10">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-primary" strokeWidth={1.5} />
            </div>
            <h3 className="font-semibold text-sm">{t("onboarding_welcome_feature_tips")}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{t("onboarding_welcome_feature_tips_desc")}</p>
          </Card>

          <Card className="p-4 space-y-2 bg-white/60 backdrop-blur-sm border-primary/10">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" strokeWidth={1.5} />
            </div>
            <h3 className="font-semibold text-sm">{t("onboarding_welcome_feature_team")}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{t("onboarding_welcome_feature_team_desc")}</p>
          </Card>

          <Card className="p-4 space-y-2 bg-white/60 backdrop-blur-sm border-primary/10">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-primary" strokeWidth={1.5} />
            </div>
            <h3 className="font-semibold text-sm">{t("onboarding_welcome_feature_reports")}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{t("onboarding_welcome_feature_reports_desc")}</p>
          </Card>
        </div>

        <Button className="w-full h-14 text-lg" size="lg" onClick={onContinue}>
          {t("onboarding_welcome_cta")}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          {t("onboarding_welcome_time_hint")}
        </p>
      </div>
    </div>
  )
}
