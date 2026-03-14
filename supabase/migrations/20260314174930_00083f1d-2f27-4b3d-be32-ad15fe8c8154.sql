
DELETE FROM financial_records WHERE contract_id IN (
  SELECT c.id FROM contracts c 
  JOIN proposals p ON c.proposal_id = p.id 
  JOIN cases cs ON p.case_id = cs.id 
  JOIN leads l ON cs.lead_id = l.id 
  WHERE l.name = 'TESTE IMPORTACAO' AND l.sync_source = 'access_import'
);

DELETE FROM contracts WHERE proposal_id IN (
  SELECT p.id FROM proposals p 
  JOIN cases cs ON p.case_id = cs.id 
  JOIN leads l ON cs.lead_id = l.id 
  WHERE l.name = 'TESTE IMPORTACAO' AND l.sync_source = 'access_import'
);

DELETE FROM proposals WHERE case_id IN (
  SELECT cs.id FROM cases cs 
  JOIN leads l ON cs.lead_id = l.id 
  WHERE l.name = 'TESTE IMPORTACAO' AND l.sync_source = 'access_import'
);

DELETE FROM cases WHERE lead_id IN (
  SELECT l.id FROM leads l 
  WHERE l.name = 'TESTE IMPORTACAO' AND l.sync_source = 'access_import'
);

DELETE FROM leads WHERE name = 'TESTE IMPORTACAO' AND sync_source = 'access_import';

DELETE FROM clients WHERE document_number = '999999999' AND notes LIKE '%Importado do Access%';
