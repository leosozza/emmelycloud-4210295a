const Privacy = () => {
  return (
    <div className="min-h-screen bg-background text-foreground px-6 py-12 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Política de Privacidade</h1>
      <p className="text-sm text-muted-foreground mb-8">Última atualização: Fevereiro de 2026</p>

      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-semibold">1. Introdução</h2>
        <p>A Emmely Fernandes Advogados ("nós", "nosso") está comprometida com a proteção dos dados pessoais dos nossos clientes, parceiros e utilizadores deste website. Esta política descreve como recolhemos, utilizamos, armazenamos e protegemos as suas informações pessoais, em conformidade com o Regulamento Geral sobre a Proteção de Dados (RGPD) e demais legislação aplicável.</p>
      </section>

      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-semibold">2. Dados que recolhemos</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Dados de identificação:</strong> nome, email, telefone, documento de identificação.</li>
          <li><strong>Dados de comunicação:</strong> mensagens enviadas através do Instagram, WhatsApp, email ou formulários do website.</li>
          <li><strong>Dados de navegação:</strong> endereço IP, tipo de navegador, páginas visitadas.</li>
          <li><strong>Dados processuais:</strong> informações relacionadas com processos jurídicos, quando aplicável.</li>
        </ul>
      </section>

      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-semibold">3. Finalidade do tratamento</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>Prestação de serviços jurídicos e acompanhamento de processos.</li>
          <li>Comunicação com clientes e potenciais clientes.</li>
          <li>Gestão administrativa e financeira dos contratos.</li>
          <li>Cumprimento de obrigações legais e regulamentares.</li>
        </ul>
      </section>

      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-semibold">4. Base legal</h2>
        <p>O tratamento dos seus dados baseia-se no consentimento do titular, na execução de contrato, no cumprimento de obrigações legais e nos interesses legítimos do escritório.</p>
      </section>

      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-semibold">5. Partilha de dados</h2>
        <p>Os seus dados pessoais não serão partilhados com terceiros, exceto quando necessário para a prestação dos serviços jurídicos, por exigência legal ou com o seu consentimento expresso.</p>
      </section>

      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-semibold">6. Conservação dos dados</h2>
        <p>Os dados pessoais serão conservados pelo período estritamente necessário para as finalidades para as quais foram recolhidos, respeitando os prazos legais aplicáveis.</p>
      </section>

      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-semibold">7. Direitos do titular</h2>
        <p>Nos termos do RGPD, tem direito de acesso, retificação, eliminação, limitação do tratamento, portabilidade e oposição ao tratamento dos seus dados pessoais. Para exercer estes direitos, entre em contacto connosco.</p>
      </section>

      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-semibold">8. Contacto</h2>
        <p>Para questões relacionadas com a proteção de dados, contacte-nos através do email: <strong>ailson.franca.pt@outlook.com</strong></p>
      </section>
    </div>
  );
};

export default Privacy;
