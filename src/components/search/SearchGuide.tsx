import {
  BookOpen,
  CheckCircle2,
  Filter,
  HelpCircle,
  MapPin,
  Save,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const STEPS = [
  {
    icon: Search,
    title: "Escolha o segmento",
    text: "Digite um tipo de negócio, como “dentista” ou “pet shop”. As sugestões trazem os melhores resultados.",
  },
  {
    icon: MapPin,
    title: "Defina o local",
    text: "Selecione o estado e, se quiser, a cidade (nome oficial do município).",
  },
  {
    icon: Filter,
    title: "Filtre os resultados",
    text: "Mostre só quem tem telefone, site ou redes sociais, ou filtre pelo nome.",
  },
  {
    icon: Save,
    title: "Salve os leads",
    text: "Marque os que interessam e clique em Salvar. Duplicados são detectados automaticamente.",
  },
];

/** Compact, dismissible strip shown above the search form for new users. */
export function SearchGuideStrip({ onDismiss }: { onDismiss: () => void }) {
  return (
    <section
      aria-label="Como pesquisar"
      className="card-surface relative mb-4 overflow-hidden p-4 animate-page-in sm:p-5"
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-gold opacity-15 blur-2xl"
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Como pesquisar em 4 passos</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="-mr-2 -mt-2 h-8 w-8"
          onClick={onDismiss}
          aria-label="Fechar guia"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ol className="relative mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STEPS.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="flex gap-3 rounded-lg bg-muted/60 p-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                {title}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

/** Full guide in a side panel; never covers the page permanently. */
export function SearchGuideButton() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <HelpCircle className="h-4 w-4" />
          Como pesquisar
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Guia de busca</SheetTitle>
          <SheetDescription>
            Tudo o que você precisa para encontrar e salvar bons leads.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-6">
          <Section title="1. Segmento">
            <p>
              Use palavras simples no singular: <b>dentista</b>, <b>academia</b>,{" "}
              <b>contabilidade</b>. Termos conhecidos são convertidos para as categorias do
              OpenStreetMap e trazem resultados completos.
            </p>
            <p>
              Termos livres (ex.: “marmoraria”) buscam pelo nome do estabelecimento — funcionam, mas
              podem trazer menos resultados.
            </p>
          </Section>
          <Section title="2. Localidade">
            <p>
              <b>Estado</b> é obrigatório para a busca completa. <b>Cidade</b> é opcional: use o
              nome oficial do município, com acentos (ex.: “São José dos Campos”).
            </p>
            <p>
              <b>Todo o Brasil</b> usa apenas a busca textual, que é mais rápida, porém menos
              completa. Prefira escolher um estado.
            </p>
          </Section>
          <Section title="3. Tempo de resposta">
            <p>
              As fontes são públicas e gratuitas. Uma busca pode levar de alguns segundos até cerca
              de um minuto. Você pode <b>cancelar</b> a qualquer momento; resultados das suas APIs
              aparecem assim que chegam.
            </p>
            <p>
              Para respeitar os limites de uso, cada conta pode fazer algumas buscas por minuto e
              resultados idênticos ficam em cache por 10 minutos.
            </p>
          </Section>
          <Section title="4. Interpretando os resultados">
            <p className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> Dados exibidos vêm
              exatamente da fonte indicada em cada lead.
            </p>
            <p className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> “Não verificado na
              fonte” significa que a fonte não informou aquele dado. Nada é inventado.
            </p>
            <p>
              Use os filtros para focar em quem tem <b>telefone</b>, <b>site</b> ou{" "}
              <b>redes sociais</b>. Clique em um resultado para ver no mapa.
            </p>
          </Section>
          <Section title="5. Salvando">
            <p>
              Marque os resultados e clique em <b>Salvar</b>. O sistema reconhece duplicados pelo
              identificador da fonte, pelo CNPJ ou pelo mesmo nome no mesmo local — filiais
              diferentes da mesma rede são mantidas.
            </p>
            <p>
              Depois, organize em <b>Coleções</b>, acompanhe no <b>Kanban</b> e enriqueça pelo{" "}
              <b>CNPJ</b> na página do lead.
            </p>
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
