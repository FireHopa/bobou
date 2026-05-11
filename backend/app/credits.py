from __future__ import annotations

import math
import os
from dataclasses import asdict, dataclass, replace
from datetime import datetime, timezone
from typing import Any, Iterable

from fastapi import HTTPException, Response
from sqlmodel import Session

from .models import User

INITIAL_CREDITS = 12_000
DAILY_FREE_CREDITS = 3_000

CREDIT_HEADER = "X-User-Credits"
CREDIT_CHARGED_HEADER = "X-Credits-Charged"
CREDIT_ACTION_HEADER = "X-Credit-Action"


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or str(raw).strip() == "":
        return default
    try:
        return float(str(raw).replace(",", "."))
    except Exception:
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or str(raw).strip() == "":
        return default
    try:
        return int(float(str(raw).replace(",", ".")))
    except Exception:
        return default


# 1 crédito = R$ 0,001. Assim, 1.000 créditos representam R$ 1,00 de custo interno estimado.
# Os valores podem ser ajustados no .env sem alterar código.
CREDIT_BRL_VALUE = _env_float("CREDIT_BRL_VALUE", 0.001)
USD_BRL_RATE = _env_float("CREDIT_USD_BRL_RATE", 5.5)
PLATFORM_STRUCTURE_MULTIPLIER = _env_float("CREDIT_STRUCTURE_MULTIPLIER", 2.2)
PLATFORM_STRUCTURE_MIN_BRL = _env_float("CREDIT_STRUCTURE_MIN_BRL", 0.08)
CREDIT_ROUNDING_STEP = max(1, _env_int("CREDIT_ROUNDING_STEP", 10))

# Referência base usada pelo estimador. Mantive em variáveis para facilitar revisão quando os fornecedores mudarem preço.
GPT_5_4_INPUT_USD_PER_1M = _env_float("CREDIT_GPT_5_4_INPUT_USD_PER_1M", 2.50)
GPT_5_4_OUTPUT_USD_PER_1M = _env_float("CREDIT_GPT_5_4_OUTPUT_USD_PER_1M", 15.00)
WEB_SEARCH_USD_PER_CALL = _env_float("CREDIT_WEB_SEARCH_USD_PER_CALL", 0.010)
AUDIO_TRANSCRIPTION_USD_PER_MINUTE = _env_float("CREDIT_AUDIO_TRANSCRIPTION_USD_PER_MINUTE", 0.006)

# Custos médios por chamada de imagem. São estimativas comerciais internas porque variam por engine, qualidade, tamanho e retry.
IMAGE_PROMPT_REFINEMENT_BRL = _env_float("CREDIT_IMAGE_PROMPT_REFINEMENT_BRL", 0.55)
IMAGE_OPENAI_GENERATION_BRL = _env_float("CREDIT_IMAGE_OPENAI_GENERATION_BRL", 0.95)
IMAGE_OPENAI_EDIT_BRL = _env_float("CREDIT_IMAGE_OPENAI_EDIT_BRL", 1.25)
IMAGE_FLUX_GENERATION_BRL = _env_float("CREDIT_IMAGE_FLUX_GENERATION_BRL", 0.80)
IMAGE_GOOGLE_GENERATION_BRL = _env_float("CREDIT_IMAGE_GOOGLE_GENERATION_BRL", 0.90)
IMAGE_LOCAL_PROCESSING_BRL = _env_float("CREDIT_IMAGE_LOCAL_PROCESSING_BRL", 0.35)

TOKENS_PER_CHAR = 0.25


@dataclass(frozen=True)
class CreditAction:
    key: str
    title: str
    description: str
    credits: int
    category: str
    billing_basis: str = "Estimativa por uso real + estrutura"
    estimated_cost_brl: float = 0.0


@dataclass(frozen=True)
class CreditPlan:
    id: str
    title: str
    description: str
    monthly_fit: str
    display_price: str
    base_credits: int
    bonus_credits: int
    badge: str | None = None
    recommended: bool = False
    kind: str = "plan"

    @property
    def total_credits(self) -> int:
        return int(self.base_credits + self.bonus_credits)


def format_credit_amount(value: int | float | None) -> str:
    normalized = int(value or 0)
    return f"{normalized:,}".replace(",", ".")


def _round_credits(value: int | float) -> int:
    normalized = max(1, int(math.ceil(float(value or 0))))
    return int(math.ceil(normalized / CREDIT_ROUNDING_STEP) * CREDIT_ROUNDING_STEP)


def brl_to_credits(value_brl: float) -> int:
    if CREDIT_BRL_VALUE <= 0:
        return _round_credits(value_brl * 1000)
    return _round_credits(value_brl / CREDIT_BRL_VALUE)


def credits_to_brl(value: int | float) -> float:
    return round(float(value or 0) * CREDIT_BRL_VALUE, 4)


def estimate_text_tokens(*texts: Any) -> int:
    chars = 0
    for item in texts:
        if item is None:
            continue
        if isinstance(item, (dict, list, tuple)):
            chars += len(str(item))
        else:
            chars += len(str(item))
    return max(1, int(math.ceil(chars * TOKENS_PER_CHAR)))


def _text_cost_brl(input_tokens: int, output_tokens: int, *, web_search_calls: int = 0) -> float:
    input_usd = (max(0, input_tokens) / 1_000_000) * GPT_5_4_INPUT_USD_PER_1M
    output_usd = (max(0, output_tokens) / 1_000_000) * GPT_5_4_OUTPUT_USD_PER_1M
    web_usd = max(0, web_search_calls) * WEB_SEARCH_USD_PER_CALL
    return (input_usd + output_usd + web_usd) * USD_BRL_RATE


def _apply_structure(raw_brl: float, *, structure_brl: float = 0.0, multiplier: float | None = None) -> float:
    base = max(0.0, float(raw_brl or 0.0)) + max(PLATFORM_STRUCTURE_MIN_BRL, structure_brl)
    return base * (PLATFORM_STRUCTURE_MULTIPLIER if multiplier is None else multiplier)


def _estimate_text_action_credits(
    *,
    input_tokens: int,
    output_tokens: int,
    web_search_calls: int = 0,
    structure_brl: float = 0.12,
    minimum_credits: int = 50,
) -> int:
    raw_brl = _text_cost_brl(input_tokens, output_tokens, web_search_calls=web_search_calls)
    return max(int(minimum_credits), brl_to_credits(_apply_structure(raw_brl, structure_brl=structure_brl)))


# Fallback inicial usado durante a montagem do catálogo de ações.
# O catálogo (_ACTIONS_BY_KEY) só existe depois que _ACTIONS é criado; por isso
# estimate_action_credits não pode depender apenas da função definida no final do arquivo.
_BOOTSTRAP_ACTION_COSTS: dict[str, int] = {
    "robot_create": 900,
    "robot_chat_message": 220,
    "robot_audio_message": 300,
    "authority_assistant_edit": 650,
    "authority_agent_run": 1300,
    "authority_agent_theme_suggestion": 600,
    "authority_agent_video_format_suggestion": 380,
    "competition_find_competitors": 900,
    "competition_analyze": 2100,
    "skybob_preflight": 1000,
    "skybob_full_run": 3600,
    "skybob_refine_run": 1700,
    "image_generate_from_scratch": 3800,
    "image_edit": 3200,
}


def get_action_cost(action_key: str) -> int:
    catalog = globals().get("_ACTIONS_BY_KEY")
    if isinstance(catalog, dict):
        item = catalog.get(action_key)
        if item is not None:
            return int(getattr(item, "credits", 0) or 0)
    return _BOOTSTRAP_ACTION_COSTS.get(action_key, 1000)


def estimate_action_credits(
    action_key: str,
    *,
    input_texts: Iterable[Any] | None = None,
    output_texts: Iterable[Any] | None = None,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    web_search_calls: int = 0,
    audio_seconds: float = 0.0,
    image_openai_generations: int = 0,
    image_openai_edits: int = 0,
    image_flux_generations: int = 0,
    image_google_generations: int = 0,
    image_prompt_refinements: int = 0,
    image_local_steps: int = 0,
    requested_versions: int = 1,
) -> int:
    """Calcula uma cobrança estimada a cada pedido.

    A cobrança combina custo variável estimado de fornecedor + uma camada de estrutura do produto
    (servidor, armazenamento, retries, gateway, manutenção e margem operacional). Quando não há
    dados suficientes, usa o valor mínimo da ação para evitar cobrar zero em operações pesadas.
    """
    fallback = get_action_cost(action_key)

    if input_tokens is None:
        input_tokens = estimate_text_tokens(*(input_texts or []))
    if output_tokens is None:
        output_tokens = estimate_text_tokens(*(output_texts or []))

    if action_key == "robot_create":
        return _estimate_text_action_credits(input_tokens=input_tokens, output_tokens=output_tokens, structure_brl=0.35, minimum_credits=900)
    if action_key == "robot_chat_message":
        return _estimate_text_action_credits(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            web_search_calls=web_search_calls,
            structure_brl=0.08,
            minimum_credits=220,
        )
    if action_key == "robot_audio_message":
        audio_brl = (max(1.0, audio_seconds) / 60.0) * AUDIO_TRANSCRIPTION_USD_PER_MINUTE * USD_BRL_RATE
        text_credits = _estimate_text_action_credits(input_tokens=input_tokens, output_tokens=output_tokens, structure_brl=0.10, minimum_credits=240)
        return max(300, _round_credits(text_credits + brl_to_credits(_apply_structure(audio_brl, structure_brl=0.05, multiplier=1.4))))
    if action_key == "authority_assistant_edit":
        return _estimate_text_action_credits(input_tokens=input_tokens, output_tokens=output_tokens, structure_brl=0.25, minimum_credits=650)
    if action_key == "authority_agent_run":
        return _estimate_text_action_credits(input_tokens=input_tokens, output_tokens=output_tokens, structure_brl=0.45, minimum_credits=1_300)
    if action_key == "authority_agent_theme_suggestion":
        return _estimate_text_action_credits(input_tokens=input_tokens, output_tokens=output_tokens, structure_brl=0.20, minimum_credits=600)
    if action_key == "authority_agent_video_format_suggestion":
        return _estimate_text_action_credits(input_tokens=input_tokens, output_tokens=output_tokens, structure_brl=0.14, minimum_credits=380)
    if action_key == "competition_find_competitors":
        return _estimate_text_action_credits(input_tokens=input_tokens, output_tokens=output_tokens, web_search_calls=1, structure_brl=0.30, minimum_credits=900)
    if action_key == "competition_analyze":
        return _estimate_text_action_credits(input_tokens=input_tokens, output_tokens=output_tokens, web_search_calls=2, structure_brl=0.70, minimum_credits=2_100)
    if action_key == "skybob_preflight":
        return _estimate_text_action_credits(input_tokens=input_tokens, output_tokens=output_tokens, structure_brl=0.35, minimum_credits=1_000)
    if action_key == "skybob_full_run":
        return _estimate_text_action_credits(input_tokens=input_tokens, output_tokens=output_tokens, structure_brl=1.20, minimum_credits=3_600)
    if action_key == "skybob_refine_run":
        return _estimate_text_action_credits(input_tokens=input_tokens, output_tokens=output_tokens, structure_brl=0.55, minimum_credits=1_700)
    if action_key in {"image_generate_from_scratch", "image_edit"}:
        versions = max(1, int(requested_versions or 1))
        if action_key == "image_generate_from_scratch":
            raw_brl = (
                max(1, image_prompt_refinements or 1) * IMAGE_PROMPT_REFINEMENT_BRL
                + max(0, image_openai_generations or versions) * IMAGE_OPENAI_GENERATION_BRL
                + max(0, image_flux_generations or versions) * IMAGE_FLUX_GENERATION_BRL
                + max(0, image_google_generations or versions) * IMAGE_GOOGLE_GENERATION_BRL
                + max(1, image_local_steps or 1) * IMAGE_LOCAL_PROCESSING_BRL
            )
            return max(3_800, brl_to_credits(_apply_structure(raw_brl, structure_brl=0.75, multiplier=1.75)))

        raw_brl = (
            max(1, image_prompt_refinements or 1) * IMAGE_PROMPT_REFINEMENT_BRL
            + max(1, image_openai_edits or versions) * IMAGE_OPENAI_EDIT_BRL
            + max(1, image_local_steps or versions) * IMAGE_LOCAL_PROCESSING_BRL
        )
        return max(3_200, brl_to_credits(_apply_structure(raw_brl, structure_brl=0.65, multiplier=1.75)))

    return fallback


def _preview_credits_for_action(action_key: str) -> int:
    sample_inputs = {
        "robot_create": 3500,
        "robot_chat_message": 2200,
        "robot_audio_message": 2400,
        "authority_assistant_edit": 6200,
        "authority_agent_run": 9000,
        "authority_agent_theme_suggestion": 5000,
        "authority_agent_video_format_suggestion": 2800,
        "competition_find_competitors": 3500,
        "competition_analyze": 8500,
        "skybob_preflight": 8500,
        "skybob_full_run": 18000,
        "skybob_refine_run": 9000,
    }
    sample_outputs = {
        "robot_create": 1800,
        "robot_chat_message": 1000,
        "robot_audio_message": 1000,
        "authority_assistant_edit": 2400,
        "authority_agent_run": 5200,
        "authority_agent_theme_suggestion": 2500,
        "authority_agent_video_format_suggestion": 1200,
        "competition_find_competitors": 1800,
        "competition_analyze": 5000,
        "skybob_preflight": 3200,
        "skybob_full_run": 12000,
        "skybob_refine_run": 4500,
    }
    if action_key == "image_generate_from_scratch":
        return estimate_action_credits(action_key, image_openai_generations=1, image_flux_generations=1, image_google_generations=1, image_prompt_refinements=1, image_local_steps=1)
    if action_key == "image_edit":
        return estimate_action_credits(action_key, image_openai_edits=1, image_prompt_refinements=1, image_local_steps=1)
    return estimate_action_credits(
        action_key,
        input_tokens=sample_inputs.get(action_key, 3000),
        output_tokens=sample_outputs.get(action_key, 1200),
        web_search_calls=1 if action_key in {"competition_find_competitors", "robot_chat_message"} else 0,
        audio_seconds=45 if action_key == "robot_audio_message" else 0,
    )


def _action(key: str, title: str, description: str, category: str, billing_basis: str = "Varia conforme tamanho do pedido") -> CreditAction:
    credits = _preview_credits_for_action(key)
    return CreditAction(
        key=key,
        title=title,
        description=description,
        credits=credits,
        category=category,
        billing_basis=billing_basis,
        estimated_cost_brl=credits_to_brl(credits),
    )


_ACTIONS: tuple[CreditAction, ...] = (
    _action("robot_create", "Criar Sócio Inteligente", "Criação inicial do robô com briefing, estratégia e prompt-base.", "Robôs"),
    _action("robot_chat_message", "Mensagem no chat", "Resposta textual em agente comum. Pode variar com histórico e uso de busca.", "Robôs"),
    _action("robot_audio_message", "Mensagem por áudio", "Transcrição do áudio + resposta do agente.", "Robôs"),
    _action("authority_assistant_edit", "Ajustar agente de autoridade", "Revisão das instruções do robô e sugestões de melhoria.", "Autoridade"),
    _action("authority_agent_run", "Executar agente de autoridade", "Execução completa de uma tarefa de autoridade.", "Autoridade"),
    _action("authority_agent_theme_suggestion", "Gerar ideias de temas", "Sugestões de temas para uma tarefa de autoridade.", "Autoridade"),
    _action("authority_agent_video_format_suggestion", "Sugerir formato de vídeo", "Análise do melhor formato para o tema informado.", "Autoridade"),
    _action("competition_find_competitors", "Encontrar concorrentes", "Mapeamento inicial de concorrentes com IA e busca externa quando disponível.", "Concorrência"),
    _action("competition_analyze", "Analisar concorrência", "Relatório consolidado de concorrência e posicionamento.", "Concorrência"),
    _action("skybob_preflight", "SkyBob: leitura inicial", "Leitura e estruturação do catálogo antes da missão principal.", "SkyBob"),
    _action("skybob_full_run", "SkyBob: estudo completo", "Estudo principal com hooks, insights, calendário e cards.", "SkyBob"),
    _action("skybob_refine_run", "SkyBob: nova rodada", "Rodada incremental baseada no feedback do usuário.", "SkyBob"),
    _action("image_generate_from_scratch", "Gerar imagem", "Geração completa de peça visual usando as engines configuradas.", "Imagem", "Varia por engine, qualidade e versões"),
    _action("image_edit", "Editar imagem", "Edição com imagem de referência, recomposição e processamento local.", "Imagem", "Varia por resolução, versões e chamadas de edição"),
)

_ACTIONS_BY_KEY = {item.key: item for item in _ACTIONS}

_PLANS: tuple[CreditPlan, ...] = (
    CreditPlan(
        id="basico",
        title="Básico",
        description="Para testar o sistema, conversar com agentes e fazer poucas tarefas por semana.",
        monthly_fit="Uso leve",
        display_price="R$ 39",
        base_credits=15_000,
        bonus_credits=0,
        kind="plan",
    ),
    CreditPlan(
        id="profissional",
        title="Profissional",
        description="Para usar agentes de autoridade, SkyBob e algumas imagens com mais frequência.",
        monthly_fit="Uso constante",
        display_price="R$ 89",
        base_credits=40_000,
        bonus_credits=5_000,
        badge="Mais indicado",
        recommended=True,
        kind="plan",
    ),
    CreditPlan(
        id="avancado",
        title="Avançado",
        description="Para rotina de produção, várias análises e criação visual recorrente.",
        monthly_fit="Uso intenso",
        display_price="R$ 179",
        base_credits=90_000,
        bonus_credits=15_000,
        badge="Melhor custo",
        kind="plan",
    ),
    CreditPlan(
        id="equipe",
        title="Equipe",
        description="Para operação pesada, times e alto volume de agentes, estudos e imagens.",
        monthly_fit="Alto volume",
        display_price="R$ 349",
        base_credits=200_000,
        bonus_credits=45_000,
        badge="Escala",
        kind="plan",
    ),
    CreditPlan(
        id="creditos_10k",
        title="10 mil créditos",
        description="Recarga avulsa para completar o saldo sem mudar de plano.",
        monthly_fit="Recarga rápida",
        display_price="R$ 19",
        base_credits=10_000,
        bonus_credits=0,
        kind="pack",
    ),
    CreditPlan(
        id="creditos_30k",
        title="30 mil créditos",
        description="Recarga avulsa para rodadas extras de agentes e publicações.",
        monthly_fit="Recarga média",
        display_price="R$ 49",
        base_credits=30_000,
        bonus_credits=3_000,
        badge="Popular",
        kind="pack",
    ),
    CreditPlan(
        id="creditos_75k",
        title="75 mil créditos",
        description="Recarga avulsa para maior volume de estudos, autoridade e imagem.",
        monthly_fit="Recarga alta",
        display_price="R$ 109",
        base_credits=75_000,
        bonus_credits=10_000,
        kind="pack",
    ),
    CreditPlan(
        id="creditos_150k",
        title="150 mil créditos",
        description="Recarga avulsa para operações maiores sem valor customizado.",
        monthly_fit="Recarga operação",
        display_price="R$ 199",
        base_credits=150_000,
        bonus_credits=25_000,
        badge="Maior saldo",
        kind="pack",
    ),
)

# Compatibilidade com IDs antigos já usados em ambiente de teste.
_PLAN_ALIASES = {
    "starter_boost": "basico",
    "growth_stack": "profissional",
    "scale_ops": "avancado",
    "elite_orbit": "equipe",
}
_PLANS_BY_ID = {item.id: item for item in _PLANS}


def get_credit_action(action_key: str) -> CreditAction:
    item = _ACTIONS_BY_KEY.get(action_key)
    if not item:
        raise KeyError(f"Ação de crédito desconhecida: {action_key}")
    return item


def get_credit_plan(plan_id: str) -> CreditPlan:
    normalized_id = _PLAN_ALIASES.get(plan_id, plan_id)
    item = _PLANS_BY_ID.get(normalized_id)
    if not item:
        raise KeyError(f"Plano de crédito desconhecido: {plan_id}")
    return item


def list_credit_actions() -> list[dict[str, Any]]:
    return [asdict(item) for item in _ACTIONS]


def list_credit_plans() -> list[dict[str, Any]]:
    payload: list[dict[str, Any]] = []
    for plan in _PLANS:
        data = asdict(plan)
        data["total_credits"] = plan.total_credits
        payload.append(data)
    return payload


def build_credit_catalog_payload(user: User) -> dict[str, Any]:
    return {
        "current_credits": int(user.credits or 0),
        "daily_free_credits": DAILY_FREE_CREDITS,
        "initial_credits": INITIAL_CREDITS,
        "credit_brl_value": CREDIT_BRL_VALUE,
        "pricing_note": "Cada pedido desconta uma estimativa de custo de IA, busca, imagem e estrutura da plataforma. O valor pode variar conforme tamanho do prompt, resposta, histórico, resolução, versões e chamadas externas.",
        "actions": list_credit_actions(),
        "plans": list_credit_plans(),
    }


def apply_daily_credit_allowance(user: User, session: Session) -> User:
    now = datetime.now(timezone.utc)
    last_reset = user.last_credit_reset or now
    if last_reset.date() >= now.date():
        return user

    user.credits = int(user.credits or 0) + DAILY_FREE_CREDITS
    user.last_credit_reset = now
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def ensure_credits(user: User, action_key: str, estimated_credits: int | None = None) -> CreditAction:
    action = get_credit_action(action_key)
    required = int(estimated_credits if estimated_credits is not None else action.credits)
    available = int(user.credits or 0)
    if available < required:
        raise HTTPException(
            status_code=403,
            detail=(
                f"Créditos insuficientes. "
                f"{action.title} custa cerca de {format_credit_amount(required)} créditos "
                f"e a sua conta tem {format_credit_amount(available)}."
            ),
        )
    return action


def charge_credits(
    session: Session,
    user: User,
    action_key: str,
    estimated_credits: int | None = None,
) -> CreditAction:
    action = get_credit_action(action_key)
    charge = int(estimated_credits if estimated_credits is not None else action.credits)
    charge = max(1, charge)
    available = int(user.credits or 0)

    # Para estimativas calculadas depois da resposta da IA, não derrubamos a entrega se o custo real
    # ficou um pouco acima da pré-validação. Nesse caso, consome o saldo restante.
    if estimated_credits is None:
        ensure_credits(user, action_key)
    elif available <= 0:
        ensure_credits(user, action_key, estimated_credits=charge)

    charged_now = min(available, charge) if estimated_credits is not None else charge
    user.credits = max(0, available - charged_now)
    session.add(user)
    session.commit()
    session.refresh(user)
    return replace(action, credits=charged_now, estimated_cost_brl=credits_to_brl(charged_now))


def add_plan_credits(session: Session, user: User, plan_id: str) -> tuple[CreditPlan, int]:
    plan = get_credit_plan(plan_id)
    user.credits = int(user.credits or 0) + int(plan.total_credits)
    session.add(user)
    session.commit()
    session.refresh(user)
    return plan, int(user.credits or 0)


def attach_credit_headers(
    response: Response | None,
    user: User,
    *,
    charged_credits: int = 0,
    action_key: str | None = None,
) -> None:
    if response is None:
        return

    response.headers[CREDIT_HEADER] = str(int(user.credits or 0))
    response.headers[CREDIT_CHARGED_HEADER] = str(max(0, int(charged_credits or 0)))
    if action_key:
        response.headers[CREDIT_ACTION_HEADER] = action_key
