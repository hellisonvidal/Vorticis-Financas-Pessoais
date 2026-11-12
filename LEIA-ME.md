# Finanças Pessoais

Sistema completo de controle financeiro pessoal. **Uma única base de código** gera:

| Plataforma | Arquivo | Como é gerado |
|---|---|---|
| Windows | `FinancasPessoais-Instalador-1.0.N.exe` e `FinancasPessoais-Portatil-1.0.N.exe` | Electron (automático no GitHub) |
| Android | `FinancasPessoais.apk` | Capacitor (automático no GitHub) |
| Navegador / PWA | pasta `www` | funciona direto, até offline |

Com a sincronização ativada (Supabase, gratuito), o que você lança no computador aparece no celular e vice-versa.

---

## 1. Funcionalidades

- **Contas e saldos**: conta corrente, poupança, carteira, investimentos e cartões de crédito. Cada conta mostra o **saldo atual** (só o que já foi pago ou recebido) e o **saldo previsto** (inclui os pendentes). Há **ajuste de saldo** para igualar ao banco e opção de arquivar contas.
- **Lançamentos**: receitas, despesas e transferências. Têm status pago/pendente, observações e etiquetas. Podem ser **parcelados** (o valor é dividido e a diferença de centavos fica na 1ª parcela) ou **recorrentes** (mensal, semanal, quinzenal, anual). A lista tem filtros, busca (inclusive por valor) e ações em lote.
- **Cartão de crédito**: limite usado e disponível, **faturas** por ciclo (pelo dia de fechamento e de vencimento), situação (aberta, fechada, paga) e botão "Pagar fatura".
- **Importação de extratos**:
  - **OFX/QFX**: o formato recomendado. Evita duplicidade pelo identificador do banco e confere o saldo informado pelo banco.
  - **CSV/TXT**: separador detectado sozinho (`;` `,` tab). Aceita uma coluna de valor ou colunas separadas de débito e crédito. O formato da data e o separador decimal podem ser escolhidos. O mapeamento de colunas fica salvo por conta.
  - **Excel**: XLS, XLSX e ODS.
  - **PDF**: lê o texto de PDFs gerados pelo banco. PDF escaneado não funciona. Revise sempre o resultado.
  - **Texto colado** do internet banking.
  - **Duplicados** já existentes são detectados e desmarcados. Em Configurações você pode **desfazer** uma importação.
  - **Categorização automática**, por regras e pelo histórico.
- **Planilhas**: exporta tudo para Excel e importa a planilha modelo. Reimportar uma planilha exportada **atualiza os lançamentos sem duplicar**.
- **Relatórios em PDF, Excel e CSV**: resumo do período, despesas e receitas por categoria, fluxo de caixa mensal, comparativo categorias × meses, extrato da conta com saldo linha a linha, lançamentos detalhados, orçamento × realizado, saldos das contas em uma data e faturas do cartão.
- **Orçamentos** por categoria, com alerta de ritmo e sugestão automática pela média dos últimos 3 meses.
- **Metas**: valor guardado manualmente ou ligado ao saldo de uma conta. Mostra quanto guardar por mês.
- **Painel** com gráficos, contas a pagar e receber e evolução do patrimônio.
- **Segurança e outros**: PIN de acesso, tema claro/escuro, backup e restauração (.json), funcionamento 100% offline.

---

## 2. Gerar o .exe (Windows) e o .apk (Android): passo a passo

Os aplicativos são compilados de graça nos servidores do GitHub. Você não precisa instalar nada de programação.

1. Crie uma conta em <https://github.com> (gratuita).
2. Clique em **New repository**, dê um nome (ex.: `financas-pessoais`) e marque **Private** se preferir. Clique em **Create repository**.
3. Envie os arquivos deste projeto para o repositório. A forma mais fácil:
   - Instale o **GitHub Desktop** (<https://desktop.github.com>).
   - Use **File → Clone repository** para clonar o repositório vazio.
   - Copie **todo o conteúdo** desta pasta para dentro da pasta clonada, incluindo a pasta oculta `.github`.
   - Escreva uma mensagem e clique em **Commit to main** e depois em **Push origin**.
4. No site do GitHub, abra a aba **Actions**. A execução **"Gerar aplicativos"** começa sozinha e leva cerca de 10 minutos.
5. Quando ficar verde ✔, clique nela e baixe em **Artifacts**:
   - `windows-exe`: tem o **instalador** e a versão **portátil** (roda sem instalar).
   - `android-apk`: tem o **FinancasPessoais.apk**.

> **Atualizações:** a cada novo envio (push), novos arquivos são gerados. O APK usa sempre a mesma assinatura (pasta `android-signing`), então você instala por cima da versão anterior **sem perder os dados**.
> Cada compilação também publica automaticamente uma **versão** (ex.: `v1.0.3`) com os arquivos anexados, na seção **Releases** do repositório. É o jeito mais fácil de baixar.

### Instalar no Android
1. Copie o `FinancasPessoais.apk` para o celular (pelo Google Drive, por cabo ou pelo WhatsApp para você mesmo).
2. Toque no arquivo. Se o Android pedir, permita **"Instalar apps desconhecidos"** para o aplicativo que está abrindo o arquivo.
3. Toque em **Instalar**. Se aparecer o aviso do Play Protect, escolha **"Instalar assim mesmo"**. Ele aparece porque o app não veio da Play Store.

### Instalar no Windows
Execute o `FinancasPessoais-Instalador-1.0.N.exe`. Se aparecer **"O Windows protegeu o computador"**, clique em **Mais informações → Executar assim mesmo**. O aviso aparece porque o app não tem certificado comercial de assinatura, que é pago.

### Versão web (opcional)
O workflow pode publicar a pasta `www` no **GitHub Pages** (exige repositório público ou plano pago). Para ativar: em **Settings → Pages**, escolha *Source: GitHub Actions*; depois, em **Settings → Secrets and variables → Actions → Variables**, crie `PUBLICAR_WEB` com valor `true`. O endereço aparece em Settings → Pages. Por ele, dá para **instalar como app** pelo Chrome/Edge, inclusive no celular.

---

## 3. Sincronizar computador e celular (Supabase, gratuito)

1. Crie uma conta em <https://supabase.com> e clique em **New project**. Escolha nome, senha do banco e região (ex.: South America – São Paulo).
2. No projeto, abra **SQL Editor → New query**, cole **todo** o conteúdo do arquivo `supabase/schema.sql` e clique em **Run**.
3. Em **Project Settings → API** (ou **Connect**), copie:
   - **Project URL**, no formato `https://xxxxxxxx.supabase.co`
   - **anon public key** (ou **publishable key**)
4. No app, abra **Configurações → Sincronização**. Preencha a URL, a chave, seu e-mail e uma senha, e clique em **Criar conta**.
   - O Supabase envia um e-mail de confirmação. Confirme e depois clique em **Entrar e sincronizar**.
   - Para não precisar confirmar: Supabase → Authentication → Sign In / Providers → Email → desligue **Confirm email**.
5. No outro aparelho, preencha a **mesma URL, chave, e-mail e senha** e clique em **Entrar e sincronizar**.

A partir daí a sincronização é automática: logo após cada alteração, a cada minuto e ao reabrir o app. Sem internet, tudo continua funcionando e é enviado quando a conexão voltar. Se o mesmo lançamento for alterado nos dois aparelhos, vale a alteração **mais recente**.

**Dica:** preencha a URL e a chave em `www/config.js` **antes** de enviar ao GitHub. Assim os aplicativos já vêm configurados e basta entrar com e-mail e senha. A chave "anon" é pública por natureza: a proteção dos dados vem do login e das regras de segurança (RLS) criadas pelo `schema.sql`. Cada usuário só acessa os próprios dados.

---

## 4. Como exportar o extrato do seu banco

Procure no internet banking (computador) por **Extrato → Exportar / Salvar como / Baixar**:
- **OFX** (às vezes aparece como "Money", "Quicken" ou "Gerenciador financeiro"): é a melhor opção.
- **CSV / Excel**: boa opção. Nubank, Inter e outros oferecem CSV da conta e da fatura.
- **PDF**: funciona com PDFs gerados pelo banco. Revise os sinais (entrada +, saída −) antes de importar.

**Fatura de cartão em CSV:** importe na conta do tipo *Cartão de crédito*. O sistema percebe que as compras vêm positivas e sugere **inverter o sinal**.

---

## 5. Primeiros passos no app

1. **Contas e cartões → Nova conta**: cadastre cada conta com o saldo que ela tinha antes do primeiro lançamento. Nos cartões, informe limite, dia de fechamento e dia de vencimento.
2. Lance as despesas e receitas pelo botão **+** ou **importe os extratos**.
3. Defina **orçamentos** e **metas**.
4. Faça um **backup** de vez em quando (Configurações → Fazer backup). Com a sincronização ativa, a nuvem também guarda seus dados.

Quer só conhecer o sistema? Clique em **"Ver com dados de exemplo"** no painel. Depois remova esses dados em Configurações.

---

## 6. Para desenvolvedores

```
www/                 interface (HTML/CSS/JS puro, sem build), usada pelos 3 apps
  js/store.js        banco local (IndexedDB) com exclusão lógica e marcação de pendências de envio
  js/sync.js         sincronização via API REST do Supabase ("último a salvar vence")
  js/finance.js      regras: saldos, parcelas, faturas, orçamentos, categorização
  js/importers.js    OFX, CSV, Excel, PDF e texto
  js/reports.js      relatórios → tela, PDF (jsPDF), Excel (SheetJS), CSV
  vendor/            bibliotecas locais (funciona offline)
desktop/             Electron (Windows)
capacitor.config.json, package.json   Capacitor (Android)
supabase/schema.sql  tabela, segurança (RLS) e regra de conflito
.github/workflows/   compilação automática do APK e do EXE
```

Comandos locais (opcionais):
- **Testar no navegador:** `npm run web` e abra <http://localhost:8080>.
- **Windows:** dentro da pasta `desktop`, rode `npm install`, depois `npm start` para abrir ou `npm run dist` para gerar os .exe.
- **Android** (requer Android Studio): rode `npm install`, `npx cap add android`, `npm run android:icons`, `npx cap sync android` e `npm run android:apk`.

Valores são guardados em **centavos (inteiros)**, para não haver erros de arredondamento. As datas ficam no formato `AAAA-MM-DD`.
