import LegalDocumentLayout, { type LegalSection } from "@/components/legal/LegalDocumentLayout";
import { APP_NAME } from "@/constants/app";

const sections: LegalSection[] = [
  {
    title: "Aceitação e abrangência",
    paragraphs: [
      `Ao acessar, criar conta ou utilizar o ${APP_NAME}, você concorda com estes Termos de Serviço e com a Política de Privacidade vigente.`,
      "Se você estiver utilizando a plataforma em nome de uma empresa, declara possuir poderes para aceitar estes termos em nome da organização e responsabiliza-se pela conformidade interna do uso.",
    ],
  },
  {
    title: "Objeto da plataforma",
    paragraphs: [
      `${APP_NAME} disponibiliza funcionalidades de automação, organização de projetos, geração de conteúdo, operação assistida por inteligência artificial e integrações com serviços e redes de terceiros.`,
      "Algumas funcionalidades podem depender de disponibilidade técnica, limites de provedores externos, autenticação própria e regras específicas de plataformas conectadas.",
    ],
  },
  {
    title: "Cadastro, acesso e responsabilidade da conta",
    paragraphs: [
      "Você é responsável por manter a confidencialidade das credenciais, pela veracidade das informações cadastradas e por toda atividade realizada na sua conta.",
      "É proibido compartilhar acessos de forma indevida, tentar contornar restrições técnicas, explorar falhas de segurança ou utilizar a plataforma para fins ilícitos, abusivos ou fraudulentos.",
    ],
    bullets: [
      "Manter dados cadastrais atualizados.",
      "Comunicar imediatamente qualquer suspeita de acesso não autorizado.",
      "Utilizar integrações de terceiros apenas com autorização legítima.",
    ],
  },
  {
    title: "Uso permitido e restrições",
    paragraphs: [
      "O uso da plataforma deve observar a legislação aplicável, estes termos, a boa-fé e as políticas dos provedores integrados.",
    ],
    bullets: [
      "Não é permitido enviar conteúdo ilegal, difamatório, discriminatório, enganoso ou que viole direitos de terceiros.",
      "Não é permitido tentar realizar engenharia reversa, scraping abusivo, exploração automatizada sem autorização ou qualquer atividade que comprometa estabilidade, disponibilidade ou segurança.",
      "Não é permitido utilizar a plataforma para publicar conteúdo em contas de terceiros sem autorização expressa.",
    ],
  },
  {
    title: "Conteúdo, dados enviados e responsabilidade do usuário",
    paragraphs: [
      "Você permanece responsável pelos textos, imagens, arquivos, prompts, instruções, publicações e demais materiais enviados, armazenados, processados ou distribuídos por meio da plataforma.",
      "A plataforma pode processar esse conteúdo para executar funcionalidades contratadas, gerar respostas, organizar fluxos e operar integrações, sem assumir autoria, validação editorial ou garantia de adequação jurídica do material produzido.",
    ],
  },
  {
    title: "Integrações com serviços de terceiros",
    paragraphs: [
      "A plataforma pode se conectar a provedores como Google, LinkedIn, Meta, TikTok, YouTube e outros serviços externos para autenticação, importação de dados, publicação ou automação.",
      "Essas integrações estão sujeitas às condições, disponibilidade, limites, APIs e políticas definidas por cada terceiro, que podem mudar ou ser interrompidas independentemente da vontade da plataforma.",
    ],
  },
  {
    title: "Propriedade intelectual",
    paragraphs: [
      `A estrutura da plataforma, software, interface, marcas, identidade visual, fluxos, componentes e demais elementos do ${APP_NAME} permanecem protegidos pela legislação aplicável e por direitos de propriedade intelectual.`,
      "Estes termos não transferem titularidade sobre o software. É concedido apenas um direito limitado, revogável, não exclusivo e intransferível de uso da plataforma conforme a finalidade contratada.",
    ],
  },
  {
    title: "Disponibilidade, manutenção e alterações",
    paragraphs: [
      "A plataforma poderá passar por manutenção, atualização, correção, evolução funcional ou indisponibilidade temporária, inclusive por dependência de infraestrutura ou serviços de terceiros.",
      "Funcionalidades, planos, limites, fluxos e requisitos técnicos podem ser alterados para evolução do produto, adequação regulatória, segurança ou continuidade operacional.",
    ],
  },
  {
    title: "Isenções e limitação de responsabilidade",
    paragraphs: [
      "Os recursos são disponibilizados conforme disponibilidade e esforço operacional razoável. Não há garantia de resultado comercial, posicionamento em plataformas de busca, performance de campanhas, engajamento ou disponibilidade ininterrupta.",
      "Na máxima extensão permitida pela lei, a responsabilidade da plataforma fica limitada aos danos diretos comprovadamente causados por sua conduta, excluindo-se lucros cessantes, danos indiretos, perda de oportunidade, perda de receita, reputação, dados ou resultados esperados.",
    ],
  },
  {
    title: "Suspensão, cancelamento e encerramento",
    paragraphs: [
      "O acesso pode ser suspenso ou encerrado, com ou sem aviso prévio razoável quando cabível, em caso de violação destes termos, uso indevido, risco à segurança, exigência legal ou necessidade técnica relevante.",
      "O encerramento da conta não elimina obrigações anteriores nem impede retenções mínimas exigidas por lei, auditoria, prevenção a fraude ou defesa de direitos.",
    ],
  },
  {
    title: "Alterações destes termos e foro",
    paragraphs: [
      "Estes Termos de Serviço podem ser atualizados a qualquer momento. A versão publicada nesta página será considerada a versão vigente a partir da sua divulgação.",
      "Eventual tolerância a descumprimentos não significa renúncia de direito. Aplica-se a legislação brasileira, especialmente normas civis, consumeristas e de proteção de dados, quando pertinentes.",
    ],
  },
];

export default function TermsOfServicePage() {
  return (
    <LegalDocumentLayout
      badge="Termos de Serviço"
      title={`Termos de Serviço do ${APP_NAME}`}
      description="Este documento estabelece as regras de uso da plataforma, define responsabilidades das partes e delimita o uso legítimo dos recursos, integrações e serviços oferecidos."
      lastUpdated="31 de março de 2026"
      sections={sections}
      complementaryHref="/politica-de-privacidade"
      complementaryLabel="Ver Política de Privacidade"
    />
  );
}
