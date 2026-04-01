import * as React from "react";
import { Link } from "react-router-dom";
import LegalDocumentLayout, { type LegalSection } from "@/components/legal/LegalDocumentLayout";
import { APP_NAME } from "@/constants/app";

const updatedAt = "1 de abril de 2026";

const sections: LegalSection[] = [
  {
    id: "01",
    title: "Abrangência e identificação da operação",
    content: (
      <>
        <p>
          Esta Política de Privacidade descreve como a plataforma <strong>{APP_NAME}</strong> trata dados pessoais no
          contexto de acesso ao site, criação de conta, autenticação, uso de áreas internas, criação de robôs/agentes,
          chats, uploads, transcrição de áudio, análises, geração de conteúdo, integrações e demais funcionalidades do
          serviço.
        </p>
        <p>
          Para fins desta Política, considera-se controladora a operação responsável pela disponibilização da plataforma
          ao usuário nos domínios, ambientes e canais oficiais do serviço. Quando houver tratamento realizado por
          prestadores em nome da plataforma, eles atuarão como operadores ou prestadores vinculados à execução do
          serviço.
        </p>
      </>
    ),
  },
  {
    id: "02",
    title: "Quais dados podem ser tratados",
    content: (
      <>
        <p>Conforme a forma de uso da plataforma, poderão ser tratados, entre outros, os seguintes grupos de dados:</p>
        <ul className="list-disc space-y-2 pl-5 text-zinc-200">
          <li>dados cadastrais, como nome, e-mail, senha criptografada e identificadores de conta;</li>
          <li>dados de autenticação social, como identificadores e informações devolvidas por provedores conectados;</li>
          <li>dados de integrações com LinkedIn, Instagram, Facebook, YouTube, TikTok e Google Business Profile;</li>
          <li>conteúdos enviados pelo usuário, como prompts, mensagens, briefings, arquivos, textos, documentos e áudios;</li>
          <li>metadados operacionais, como horário de criação, saldo interno de créditos, estado de integrações e status de tarefas;</li>
          <li>dados técnicos necessários ao funcionamento do serviço, segurança, sessão e persistência local no navegador.</li>
        </ul>
      </>
    ),
  },
  {
    id: "03",
    title: "Como os dados são coletados",
    content: (
      <>
        <p>Os dados podem ser coletados:</p>
        <ul className="list-disc space-y-2 pl-5 text-zinc-200">
          <li>diretamente do usuário, ao criar conta, autenticar-se, preencher campos, conversar com agentes ou enviar arquivos;</li>
          <li>por provedores terceiros, quando o usuário escolhe autenticar ou conectar contas externas;</li>
          <li>pelo próprio uso da plataforma, para viabilizar segurança, histórico operacional, execução de rotinas e persistência de sessão;</li>
          <li>por integrações ativadas pelo usuário, na medida necessária para publicação, consulta ou sincronização das funcionalidades escolhidas.</li>
        </ul>
      </>
    ),
  },
  {
    id: "04",
    title: "Finalidades do tratamento",
    content: (
      <>
        <p>Os dados pessoais podem ser tratados para as seguintes finalidades:</p>
        <ul className="list-disc space-y-2 pl-5 text-zinc-200">
          <li>criar, autenticar e administrar contas de usuário;</li>
          <li>disponibilizar robôs, agentes, chats, análises, transcrição de áudio, geração de conteúdo e recursos da plataforma;</li>
          <li>processar materiais enviados pelo usuário para compor contexto, instruções, relatórios, respostas e automações;</li>
          <li>executar integrações solicitadas pelo usuário com plataformas externas;</li>
          <li>manter segurança, prevenção a fraude, rastreabilidade mínima e integridade operacional do serviço;</li>
          <li>cumprir obrigações legais, regulatórias ou ordens de autoridade competente;</li>
          <li>resguardar direitos em procedimentos administrativos, arbitrais ou judiciais;</li>
          <li>promover melhoria contínua, correção de falhas, suporte e evolução funcional do produto.</li>
        </ul>
      </>
    ),
  },
  {
    id: "05",
    title: "Bases legais normalmente aplicáveis",
    content: (
      <>
        <p>
          O tratamento poderá ocorrer, conforme o caso concreto, com fundamento em execução de contrato ou de
          procedimentos preliminares relacionados ao serviço solicitado pelo usuário, cumprimento de obrigação legal ou
          regulatória, exercício regular de direitos, legítimo interesse para segurança e operação do serviço e, quando
          necessário, consentimento.
        </p>
        <p>
          Quando o consentimento for exigível para situação específica, a plataforma buscará registrá-lo de forma
          adequada ao contexto. A ausência de determinada base legal poderá impedir a disponibilização de certas
          funcionalidades.
        </p>
      </>
    ),
  },
  {
    id: "06",
    title: "Compartilhamento de dados",
    content: (
      <>
        <p>Os dados poderão ser compartilhados, no limite do necessário, com:</p>
        <ul className="list-disc space-y-2 pl-5 text-zinc-200">
          <li>prestadores de infraestrutura, hospedagem, autenticação, banco de dados, segurança e suporte técnico;</li>
          <li>provedores de IA, transcrição, processamento automatizado e busca web utilizados para execução do serviço;</li>
          <li>plataformas conectadas voluntariamente pelo usuário, como Google, LinkedIn, Meta, TikTok, YouTube e Google Business Profile;</li>
          <li>autoridades públicas, judiciárias ou administrativas, quando houver obrigação legal, regulatória ou ordem válida;</li>
          <li>assessores profissionais e parceiros estritamente necessários para defesa de direitos e operação regular do serviço.</li>
        </ul>
        <p>
          A plataforma não deve compartilhar dados com terceiros para finalidade incompatível com esta Política sem base
          legal adequada.
        </p>
      </>
    ),
  },
  {
    id: "07",
    title: "Transferência internacional",
    content: (
      <>
        <p>
          Parte da infraestrutura tecnológica e de alguns provedores utilizados pela plataforma pode envolver tratamento
          de dados fora do Brasil. Nesses casos, a operação buscará adotar medidas contratuais e organizacionais
          compatíveis com a legislação aplicável e com o nível de risco do tratamento.
        </p>
      </>
    ),
  },
  {
    id: "08",
    title: "Armazenamento e retenção",
    content: (
      <>
        <p>
          Os dados são mantidos pelo tempo necessário para cumprir as finalidades desta Política, executar o serviço,
          preservar histórico operacional mínimo, cumprir obrigações legais, prevenir fraude, resolver incidentes,
          permitir defesa de direitos e atender requisições legítimas.
        </p>
        <p>
          Sempre que tecnicamente possível e juridicamente cabível, os dados serão eliminados, anonimizados ou
          desvinculados ao final do ciclo de retenção aplicável.
        </p>
      </>
    ),
  },
  {
    id: "09",
    title: "Direitos do titular",
    content: (
      <>
        <p>
          O titular poderá solicitar, nos termos da legislação aplicável, confirmação da existência de tratamento,
          acesso, correção, anonimização, bloqueio ou eliminação, portabilidade quando cabível, informação sobre
          compartilhamento, revisão de decisões automatizadas quando aplicável e demais direitos previstos em lei.
        </p>
        <p>
          O exercício desses direitos poderá depender de validação de identidade, análise jurídica do pedido, limites
          técnicos do ambiente e hipóteses legais de retenção ou restrição.
        </p>
      </>
    ),
  },
  {
    id: "10",
    title: "Segurança da informação",
    content: (
      <>
        <p>
          A plataforma busca adotar medidas técnicas e administrativas razoáveis para proteger dados pessoais contra
          acessos não autorizados, perda, alteração, destruição, uso indevido e tratamento incompatível com a finalidade
          declarada.
        </p>
        <p>
          Nenhum ambiente conectado à internet é absolutamente invulnerável. Por isso, o usuário também deve adotar boas
          práticas de segurança, como proteção de credenciais, uso de senha forte e cautela com conteúdos sensíveis
          enviados ao sistema.
        </p>
      </>
    ),
  },
  {
    id: "11",
    title: "Cookies, armazenamento local e sessão",
    content: (
      <>
        <p>
          A plataforma pode utilizar recursos estritamente necessários de navegador, como armazenamento local e
          persistência de sessão, para manter autenticação, preferências operacionais, continuidade de uso e funcionamento
          seguro da aplicação.
        </p>
        <p>
          Caso novos mecanismos de cookies não essenciais venham a ser adotados, a operação deverá adequar a
          transparência e os controles correspondentes.
        </p>
      </>
    ),
  },
  {
    id: "12",
    title: "Dados de terceiros e conteúdo sensível",
    content: (
      <>
        <p>
          Se o usuário inserir dados pessoais de terceiros na plataforma, declara que possui base legítima para esse
          envio e que observou os deveres de transparência e conformidade aplicáveis ao caso.
        </p>
        <p>
          O usuário deve evitar o envio de dados sensíveis ou de conteúdo sigiloso além do estritamente necessário,
          sobretudo quando a funcionalidade não exigir esse tipo de informação.
        </p>
      </>
    ),
  },
  {
    id: "13",
    title: "Atendimento e atualização da política",
    content: (
      <>
        <p>
          Questões sobre esta Política, exercício de direitos e solicitações relacionadas a privacidade devem ser
          encaminhadas ao canal oficial de atendimento e/ou ao canal de privacidade informado pela operação da
          plataforma em seus meios oficiais.
        </p>
        <p>
          Esta Política poderá ser atualizada para refletir evolução do produto, ajustes legais, mudanças operacionais ou
          aprimoramentos de transparência. A versão vigente será a publicada nesta página, com indicação da última
          atualização.
        </p>
        <p>
          Este documento deve ser interpretado em conjunto com os{" "}
          <Link to="/termos-de-servico" className="text-primary underline underline-offset-4">
            Termos de Serviço
          </Link>
          .
        </p>
      </>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalDocumentLayout
      badge="Política de Privacidade"
      title={`Política de Privacidade da ${APP_NAME}`}
      summary="Documento público que descreve, de forma objetiva e aderente ao sistema enviado, como dados pessoais podem ser coletados, utilizados, compartilhados, armazenados e protegidos no contexto de uso da plataforma."
      updatedAt={updatedAt}
      relatedLinks={[{ href: "/termos-de-servico", label: "Ver Termos de Serviço" }]}
      sections={sections}
    />
  );
}