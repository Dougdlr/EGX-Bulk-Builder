'use strict';
/* ===================================================================
   Modelos de referência da validação (Editor em lote e Criador).
   Validam só a configuração — nunca nomes ou valores de orçamento.
   Para criar um modelo novo, adicione uma chave aqui e uma <option>
   com o mesmo value no seletor "be-validation-model" do index.html.
   =================================================================== */
window.EGX_VALIDATION_MODELS = (() => {
    return {
        'esc-bid': {
            label: 'ESC BID',
            campaignBudget: 'required',
            adsetBudget: 'forbidden',
            campaignStrategy: ['Bid cap'],
            adsetStrategy: [],
            bidAmount: 'required',
            gender: ['Women'],
        },
        'esc-cbo': {
            label: 'ESC CBO',
            campaignBudget: 'required',
            adsetBudget: 'forbidden',
            campaignStrategy: ['Highest volume or value'],
            adsetStrategy: [],
            bidAmount: 'optional',
            gender: ['Women'],
        },
        'tads-abo': {
            label: 'TADS ABO',
            campaignBudget: 'forbidden',
            adsetBudget: 'required',
            campaignStrategy: [],
            adsetStrategy: ['Highest volume or value'],
            bidAmount: 'optional',
            gender: ['Men'],
            attribution:
                '[{"event_type":"CLICK_THROUGH","window_days":7},{"event_type":"VIEW_THROUGH","window_days":1}]',
        },
    };
})();
