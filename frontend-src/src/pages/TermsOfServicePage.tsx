import * as React from "react";
import { Link } from "react-router-dom";
import LegalDocumentLayout, { type LegalSection } from "@/components/legal/LegalDocumentLayout";
import { APP_NAME } from "@/constants/app";

const updatedAt = "1 de abril de 2026";

const sections: LegalSection[] = [
  {
    id: "01",
    title: "Objeto e escopo",
    content: (
      <>
        <p>
          Este Termo de Serviço regula o acesso e o uso da plataforma <strong>{APP_NAME}</strong>, inclusive suas áreas
          públicas e autenticadas, ferramentas de criação de robôs/agentes, geração e edição de conteúdo, análises,
          automações, integrações com terceiros, transcrição de áudio, upload de materiais e demais funcionalidades
          disponibilizadas ao usuário.
        </p>
        <p>
          A plataforma é destinada a operações de produtividade, marketing, autoridade digital, conteúdo e apoio à
          tomada de decisão. O uso da plataforma não substitui revisão humana, validação técnica, validação jurídica nem
          avaliação profissional independente quando a atividade exigir esse cuidado.
        </p>
      </>
    ),
  },
  {
    id: "02",
    title: "Aceite e vigência",
    content: (
      <>
        <p>
          Ao acessar, navegar, criar conta, autenticar-se, conectar integrações, enviar conteúdo, acionar rotinas de IA
          ou continuar utilizando a plataforma, o usuário declara que leu e concorda com este Termo e com a{" "}
          <Link to="/politica-de-privacidade" className="text-primary underline underline-offset-4">
            Política de Privacidade
          </Link>
          .
        </p>
        <p>
          Este Termo entra em vigor na data do primeiro uso e permanece aplicável enquanto houver acesso à plataforma,
          conta ativa, dados armazenados legitimamente para prestação do serviço, cumprimento de obrigação legal,
          segurança, prevenção a fraude ou exercício regular de direitos.
        </p>
      </>
    ),
  },
  {
    id: "03",
    title: "Cadastro, credenciais e segurança da conta",
    content: (
      <>
        <p>
          Para usar funcionalidades autenticadas, o usuário poderá realizar cadastro com nome, e-mail e senha, ou optar
          por autenticação por provedor terceiro, como Google, nos fluxos disponibilizados pela plataforma.
        </p>
        <p>
          O usuário é responsável por manter a veracidade das informações fornecidas, pela confidencialidade das
          credenciais e pelo uso da própria conta. É vedado compartilhar acesso de forma indevida, contornar controles
          de autenticação, tentar utilizar credenciais de terceiros ou acessar áreas não autorizadas.
        </p>
        <p>
          Caso haja suspeita de uso indevido, o usuário deve interromper o uso da sessão, alterar suas credenciais e
          comunicar o canal oficial de atendimento da plataforma sem demora injustificada.
        </p>
      </>
    ),
  },
  {
    id: "04",
    title: "Funcionalidades, créditos e disponibilidade",
    content: (
      <>
        <p>
          Algumas ações da plataforma operam com lógica de créditos internos, limites técnicos, filas, etapas de
          processamento, validações e dependência de serviços de terceiros. A disponibilidade das funcionalidades pode
          variar conforme configuração do ambiente, integração conectada, saldo aplicável, manutenção, indisponibilidade
          externa, risco de abuso ou evolução do produto.
        </p>
        <p>
          A exibição de funcionalidades, catálogos, limites, rotinas automatizadas ou condições comerciais na
          plataforma não constitui promessa de disponibilidade permanente, irrestrita ou imutável.
        </p>
      </>
    ),
  },
  {
    id: "05",
    title: "Conteúdo do usuário, uploads e materiais enviados",
    content: (
      <>
        <p>
          O usuário permanece titular, quando aplicável, dos conteúdos, materiais, textos, instruções, áudios,
          documentos, briefings, arquivos e demais dados que enviar para a plataforma.
        </p>
        <p>
          Ao utilizar o serviço, o usuário autoriza o tratamento técnico desses materiais na medida necessária para
          execução das funcionalidades contratadas ou disponibilizadas, como leitura de arquivos, estruturação de
          briefing, transcrição de áudio, composição de histórico de chat, geração de respostas, análise de materiais e
          processamento por integrações conectadas voluntariamente.
        </p>
        <p>
          O usuário declara que possui base legítima para enviar esses conteúdos e que não utilizará a plataforma para
          inserir material ilícito, sigiloso sem autorização, ofensivo, fraudulento, discriminatório, malicioso, que
          viole propriedade intelectual de terceiros ou que exponha dados pessoais em desconformidade com a legislação.
        </p>
      </>
    ),
  },
  {
    id: "06",
    title: "Integrações com terceiros",
    content: (
      <>
        <p>
          A plataforma pode permitir conexão e uso de integrações com serviços de terceiros, incluindo autenticação,
          publicação ou leitura operacional em LinkedIn, Instagram, Facebook, YouTube, TikTok, Google Business Profile
          e outros provedores que venham a ser ofertados.
        </p>
        <p>
          Quando o usuário conecta voluntariamente uma integração, ele reconhece que o uso dessa funcionalidade também
          depende dos termos, políticas, permissões, limites, APIs, regras de publicação e critérios técnicos do
          respectivo provedor terceiro. A plataforma não responde por indisponibilidade, bloqueios, alteração de escopo,
          revogação de permissão, recusa de publicação ou mudança unilateral promovida por tais terceiros.
        </p>
      </>
    ),
  },
  {
    id: "07",
    title: "IA generativa, automações e limitações",
    content: (
      <>
        <p>
          A plataforma utiliza rotinas automatizadas e serviços de inteligência artificial para gerar textos, sugestões,
          análises, transcrições, estruturas estratégicas, materiais visuais e respostas conversacionais.
        </p>
        <p>
          O usuário reconhece que saídas de IA podem conter imprecisões, omissões, desatualização, vieses, baixa
          aderência ao contexto, inadequações comerciais ou jurídicas, e por isso devem ser revisadas antes de uso
          definitivo, publicação, distribuição, execução operacional ou tomada de decisão sensível.
        </p>
        <p>
          A plataforma não garante resultado econômico, posicionamento de marca, performance publicitária, aceitação por
          redes sociais, crescimento orgânico, conformidade regulatória automática nem ausência total de erro.
        </p>
      </>
    ),
  },
  {
    id: "08",
    title: "Usos proibidos",
    content: (
      <>
        <p>É proibido usar a plataforma para:</p>
        <ul className="list-disc space-y-2 pl-5 text-zinc-200">
          <li>praticar ato ilícito, fraude, invasão, abuso de credenciais ou tentativa de burlar controles;</li>
          <li>publicar ou automatizar conteúdo enganoso, difamatório, discriminatório ou que viole direitos de terceiros;</li>
          <li>enviar malware, scripts maliciosos, spam, engenharia reversa indevida ou exploração não autorizada;</li>
          <li>tratar dados pessoais sem base legal, sem transparência adequada ou em desacordo com a LGPD;</li>
          <li>usar a plataforma para fins que contrariem políticas obrigatórias de provedores integrados.</li>
        </ul>
      </>
    ),
  },
  {
    id: "09",
    title: "Propriedade intelectual",
    content: (
      <>
        <p>
          A estrutura da plataforma, interface, marca, organização do serviço, fluxos, componentes visuais, software e
          elementos próprios permanecem protegidos pela legislação aplicável e pelos direitos de seus titulares.
        </p>
        <p>
          Este Termo não transfere ao usuário titularidade sobre o software ou sobre ativos proprietários da plataforma,
          concedendo apenas licença de uso limitada, não exclusiva, revogável e vinculada à finalidade regular do
          serviço.
        </p>
      </>
    ),
  },
  {
    id: "10",
    title: "Suspensão, bloqueio e encerramento",
    content: (
      <>
        <p>
          A plataforma poderá restringir, suspender ou encerrar acesso, total ou parcialmente, em caso de suspeita
          razoável de fraude, abuso, violação deste Termo, risco de segurança, determinação legal, uso incompatível com
          a finalidade do serviço, tentativa de exploração técnica indevida ou necessidade de preservação da própria
          infraestrutura.
        </p>
        <p>
          Sempre que possível e compatível com a segurança do serviço, a medida será adotada com justificativa mínima
          adequada ao contexto.
        </p>
      </>
    ),
  },
  {
    id: "11",
    title: "Responsabilidade e limites",
    content: (
      <>
        <p>
          A plataforma envida esforços razoáveis para manter funcionamento, integridade operacional e segurança
          compatíveis com sua natureza, mas não garante operação ininterrupta, livre de erro ou compatibilidade absoluta
          com qualquer fluxo de negócio específico do usuário.
        </p>
        <p>
          Na máxima extensão permitida pela legislação aplicável, a plataforma não responde por danos indiretos, lucros
          cessantes, perda de oportunidade, decisões tomadas exclusivamente com base em saídas automatizadas, falhas
          decorrentes de dados incorretos fornecidos pelo usuário, indisponibilidade de terceiros integrados ou eventos
          fora de seu controle razoável.
        </p>
      </>
    ),
  },
  {
    id: "12",
    title: "Privacidade, proteção de dados e contato",
    content: (
      <>
        <p>
          O tratamento de dados pessoais relacionado ao uso da plataforma é descrito na{" "}
          <Link to="/politica-de-privacidade" className="text-primary underline underline-offset-4">
            Política de Privacidade
          </Link>
          , que integra este Termo para todos os efeitos.
        </p>
        <p>
          Solicitações relacionadas a suporte, privacidade, exercício de direitos ou questionamentos contratuais devem
          ser direcionadas ao canal oficial de atendimento e/ou ao canal de privacidade informado pela operação da
          plataforma em seus meios oficiais.
        </p>
      </>
    ),
  },
  {
    id: "13",
    title: "Legislação aplicável e foro",
    content: (
      <>
        <p>
          Este Termo será interpretado de acordo com a legislação brasileira. Em caso de controvérsia, observar-se-á o
          foro competente previsto em lei, inclusive as regras protetivas aplicáveis ao consumidor quando cabíveis.
        </p>
      </>
    ),
  },
];

export default function TermsOfServicePage() {
  return (
    <LegalDocumentLayout
      badge="Termos de Serviço"
      title={`Termos de Serviço da ${APP_NAME}`}
      summary="Documento contratual público que disciplina o uso da plataforma, o acesso às funcionalidades de IA, automação, integrações, uploads, chats, análises e demais recursos disponibilizados ao usuário."
      updatedAt={updatedAt}
      relatedLinks={[{ href: "/politica-de-privacidade", label: "Ver Política de Privacidade" }]}
      sections={sections}
    />
  );
}