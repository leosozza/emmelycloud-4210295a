const DataDeletion = () => {
  return (
    <div className="min-h-screen bg-background text-foreground px-6 py-12 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Exclusão de Dados do Utilizador</h1>
      <p className="text-sm text-muted-foreground mb-8">Última atualização: Fevereiro de 2026</p>

      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-semibold">1. O seu direito à exclusão</h2>
        <p>Nos termos do Regulamento Geral sobre a Proteção de Dados (RGPD) e da Lei Geral de Proteção de Dados (LGPD), tem o direito de solicitar a eliminação dos seus dados pessoais armazenados pela Emmely Fernandes Advogados.</p>
      </section>

      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-semibold">2. Como solicitar a exclusão</h2>
        <p>Para solicitar a exclusão dos seus dados pessoais, envie um email para:</p>
        <p className="font-semibold text-lg">ailson.franca.pt@outlook.com</p>
        <p>No email, inclua:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>O seu nome completo.</li>
          <li>O endereço de email ou número de telefone associado à sua conta.</li>
          <li>Uma descrição dos dados que pretende que sejam eliminados.</li>
          <li>Um documento de identificação para verificação (opcional, pode ser solicitado).</li>
        </ul>
      </section>

      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-semibold">3. Prazo de resposta</h2>
        <p>O seu pedido será processado no prazo máximo de 30 dias úteis após a receção. Será notificado por email quando a exclusão for concluída.</p>
      </section>

      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-semibold">4. Dados que podem não ser eliminados</h2>
        <p>Alguns dados podem ser retidos quando exigido por lei, nomeadamente:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Registos financeiros e fiscais (obrigação legal de conservação).</li>
          <li>Dados relacionados com processos jurídicos em curso ou pendentes.</li>
          <li>Dados necessários para o cumprimento de obrigações contratuais vigentes.</li>
        </ul>
      </section>

      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-semibold">5. Dados do Instagram e WhatsApp</h2>
        <p>Se interagiu connosco através do Instagram ou WhatsApp, os dados das suas conversas também podem ser eliminados mediante pedido. Note que a eliminação no nosso sistema não afeta os dados retidos pela Meta (Facebook/Instagram) nos seus próprios servidores.</p>
      </section>

      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-semibold">6. Contacto</h2>
        <p>Para qualquer questão sobre a exclusão de dados: <strong>ailson.franca.pt@outlook.com</strong></p>
      </section>
    </div>
  );
};

export default DataDeletion;
