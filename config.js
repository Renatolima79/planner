/* Dois modos de uso:
   1) MODO ARQUIVO (padrão, sem login): deixe CLIENT_ID vazio. O planner abre e salva o Planner_Dados.json da pasta do OneDrive.
   2) MODO NUVEM (login Microsoft): preencha CLIENT_ID, TENANT_ID e LINK_DADOS (veja o PASSO_A_PASSO.md).
   Não coloque dados do planner neste repositório. */
window.PLANNER_CFG = {
  CLIENT_ID: '',   // "ID do aplicativo (cliente)" do registro no Microsoft Entra ID. Vazio = modo arquivo.
  TENANT_ID: '',   // "ID do diretório (locatário)" da Seven
  LINK_DADOS: '',  // link de compartilhamento do Planner_Dados.json no SharePoint/OneDrive
  // Alternativa ao link: DRIVE_ID: '', ITEM_ID: '',
  // REDIRECT_URI: '' // opcional; por padrão é o endereço da própria página
};
