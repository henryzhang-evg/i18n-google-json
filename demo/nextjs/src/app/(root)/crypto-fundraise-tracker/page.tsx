import Translations from "@translate/app/(root)/crypto-fundraise-tracker/page";
import { I18nUtil } from "@utils/i18n";
const I18n = I18nUtil.createScoped(Translations);
export default function CryptoGptPage() {
  return (
    <div>
      {I18n.t("page test")}
      <div>{I18n.t("dsdsd")}</div>
      <div>{I18n.t("he<el0>is</el0>jack", {
          el0: text => <div>{text}</div>
        })}</div>
      <div>{I18n.t("<el0>hellow</el0> <el1>jack</el1>", {
          el0: text => <div>{text}</div>,
          el1: text => <span>{text}</span>
        })}</div>
      <div>
        <div>{I18n.t("hellow")}</div>
        <span>{I18n.t("jack")}</span>
      </div>
    </div>
  );
}
