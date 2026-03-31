import LegalDocumentLayout, { type LegalSection } from "@/components/legal/LegalDocumentLayout";
import { APP_NAME } from "@/constants/app";

const sections: LegalSection[] = [
  {
    title: "Objetivo desta política",
    paragraphs: [
      `Esta Política de Privacidade descreve como o ${APP_NAME} trata dados pessoais de usuários, leads, representantes de clientes e demais titulares que interagem com a plataforma.`,
      "O objetivo é informar, de forma clara, quais dados podem ser tratados, para quais finalidades, com quais fundamentos legais e quais direitos podem ser exercidos nos termos da legislação aplicável, incluindo a LGPD.",
    ],
  },
  {
    title: "Dados que podem ser coletados",
    paragraphs: [
      "Os dados tratados variam conforme o uso da plataforma, as integrações habilitadas e os recursos efetivamente utilizados.",
    ],
    bullets: [
      "Dados cadastrais, como nome, e-mail e informações básicas da conta.",
      "Dados de autenticação e identificação decorrentes de login próprio ou por provedores terceiros autorizados pelo usuário.",
      "Dados operacionais gerados no uso da plataforma, como projetos, prompts, mensagens, arquivos, históricos, preferências e registros de utilização.",
      "Dados de integrações com plataformas externas, quando o usuário autoriza conexão para publicação, importação, sincronização ou automação.",
      "Dados técnicos e de navegação, como endereço IP, identificadores de dispositivo, logs, data e hora de acesso, falhas e eventos de segurança.",
    ],
  },
  {
    title: "Finalidades do tratamento",
    paragraphs: [
      "Os dados podem ser utilizados para permitir o funcionamento da plataforma, melhorar a experiência do usuário, viabilizar integrações e cumprir obrigações legais e contratuais.",
    ],
    bullets: [
      "Criar, autenticar e administrar contas de usuário.",
      "Executar funcionalidades solicitadas, incluindo geração de conteúdo, automações, processamento de arquivos e organização de fluxos.",
      "Viabilizar integrações com serviços de terceiros autorizados pelo usuário.",
      "Prevenir fraude, abuso, incidentes de segurança e uso indevido da plataforma.",
      "Atender solicitações, suporte técnico, auditoria, exigências regulatórias e defesa de direitos.",
      "Realizar análises internas, melhoria de produto, estabilidade e monitoramento operacional, preferencialmente com o menor nível de identificação possível.",
    ],
  },
  {
    title: "Bases legais aplicáveis",
    paragraphs: [
      "O tratamento de dados pessoais poderá ocorrer, conforme o contexto, com base na execução de contrato, cumprimento de obrigação legal ou regulatória, exercício regular de direitos, legítimo interesse e consentimento, quando exigido.",
      "Quando o tratamento depender de consentimento, o titular poderá revogá-lo nos limites da legislação e das consequências operacionais da revogação.",
    ],
  },
  {
    title: "Compartilhamento de dados",
    paragraphs: [
      "Os dados podem ser compartilhados apenas na medida necessária para a operação da plataforma, execução do serviço, atendimento de exigências legais ou proteção legítima de direitos.",
    ],
    bullets: [
      "Prestadores de infraestrutura, hospedagem, autenticação, analytics, processamento e suporte técnico.",
      "Plataformas externas integradas pelo próprio usuário para autenticação, importação, publicação ou sincronização.",
      "Autoridades públicas, judiciais ou administrativas, quando houver obrigação legal, ordem válida ou necessidade de defesa.",
    ],
  },
  {
    title: "Armazenamento, retenção e descarte",
    paragraphs: [
      "Os dados são armazenados pelo tempo necessário para cumprir as finalidades informadas nesta política, atender obrigações legais, resolver disputas, preservar evidências, prevenir fraude e assegurar continuidade mínima da operação.",
      "Quando o tratamento deixar de ser necessário ou houver solicitação legítima de eliminação, os dados poderão ser excluídos, anonimizados ou mantidos de forma bloqueada nos limites autorizados pela lei.",
    ],
  },
  {
    title: "Segurança da informação",
    paragraphs: [
      "A plataforma adota medidas técnicas e administrativas razoáveis para reduzir riscos de acesso não autorizado, vazamento, perda, alteração indevida ou tratamento incompatível com a finalidade declarada.",
      "Nenhum ambiente conectado à internet é absolutamente invulnerável. Por isso, também é responsabilidade do usuário proteger suas credenciais, dispositivos e permissões concedidas a integrações externas.",
    ],
  },
  {
    title: "Direitos do titular",
    paragraphs: [
      "Nos termos da legislação aplicável, o titular poderá solicitar confirmação da existência de tratamento, acesso, correção, anonimização, bloqueio, eliminação, portabilidade quando cabível, informação sobre compartilhamentos e revisão de decisões automatizadas, quando aplicável.",
      "Pedidos poderão exigir validação de identidade e análise de viabilidade jurídica e técnica antes do atendimento integral.",
    ],
  },
  {
    title: "Cookies, logs e tecnologias semelhantes",
    paragraphs: [
      "A plataforma pode utilizar cookies, armazenamento local, logs e tecnologias correlatas para autenticação, segurança, persistência de sessão, medição de desempenho e melhoria de experiência.",
      "O bloqueio dessas tecnologias no navegador pode comprometer funcionalidades essenciais da aplicação.",
    ],
  },
  {
    title: "Transferência internacional e serviços de terceiros",
    paragraphs: [
      "Parte do tratamento pode envolver provedores, infraestrutura ou APIs localizados fora do Brasil. Nesses casos, serão adotadas medidas compatíveis com a legislação aplicável e com a natureza da operação.",
      "Quando o usuário conecta contas externas, o tratamento também passa a obedecer às políticas e condições dos respectivos terceiros, sobre as quais a plataforma não possui controle integral.",
    ],
  },
  {
    title: "Atualizações desta política",
    paragraphs: [
      "Esta Política de Privacidade pode ser atualizada para refletir evolução do produto, ajustes regulatórios, mudanças técnicas ou novas exigências operacionais.",
      "A versão publicada nesta página será considerada a versão vigente a partir da data de atualização indicada no topo do documento.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalDocumentLayout
      badge="Política de Privacidade"
      title={`Política de Privacidade do ${APP_NAME}`}
      description="Este documento explica como dados pessoais podem ser coletados, utilizados, compartilhados, armazenados e protegidos durante o uso da plataforma e de suas integrações."
      lastUpdated="31 de março de 2026"
      sections={sections}
      complementaryHref="/termos-de-servico"
      complementaryLabel="Ver Termos de Serviço"
    />
  );
}
