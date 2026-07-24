function teste() {
  const r = salvarAta_({
    obra: 'Obra Teste',
    data_referencia: '2026-07-20',
    avanco_previsto: 30,
    avanco_realizado: 22,
    motivo_desvio: 'Chuva / Intempéries',
    ocorrencias: 'Chuva forte impediu concretagem por 3 dias.'
  });
  Logger.log(r); // deve vir success:true

  Logger.log(getAtas({})); // deve trazer a ata acima

  Logger.log(getProblemas({})); // ⭐ deve trazer 1 problema AUTOMÁTICO (origem:"Ata")

  Logger.log(getCategoriasProblema()); // lista de categorias fixas
}
