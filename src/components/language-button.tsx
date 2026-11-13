import { LanguagesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { IconButton } from "@/ui/button";

export function LanguageButton() {
  const { t, i18n } = useTranslation();
  const chinese = i18n.resolvedLanguage === "zh-CN";
  return (
    <IconButton
      label={t(chinese ? "language.switchToEnglish" : "language.switchToChinese")}
      size="sm"
      onClick={() => void i18n.changeLanguage(chinese ? "en-US" : "zh-CN")}
    >
      <LanguagesIcon />
    </IconButton>
  );
}
