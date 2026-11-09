export function whatsappFields(input, previous={}, source='admin', now=new Date().toISOString()) {
 const number=input.whatsappNumber??previous.whatsappNumber??'';
 if(typeof number!=='string'||number.length>35)throw Error('Informe o WhatsApp com DDI, por exemplo +55 85 99999-9999.');
 const normalized=number.replace(/[ ()-]/g,'');
 if(normalized&&!/^\+[1-9]\d{7,14}$/.test(normalized))throw Error('Informe o WhatsApp com + e DDI, por exemplo +55 85 99999-9999.');
 for(const key of ['whatsappAppointments','whatsappBirthdays'])if(input[key]!==undefined&&typeof input[key]!=='boolean')throw Error('Autorização de WhatsApp inválida.');
 const appointments=input.whatsappAppointments??previous.whatsappAppointments??false;
 const birthdays=input.whatsappBirthdays??previous.whatsappBirthdays??false;
 if((appointments||birthdays)&&!normalized)throw Error('Informe o número de WhatsApp antes de registrar a autorização.');
 const changed=normalized!==(previous.whatsappNumber||'')||appointments!==Boolean(previous.whatsappAppointments)||birthdays!==Boolean(previous.whatsappBirthdays);
 return {whatsappNumber:normalized,whatsappAppointments:appointments,whatsappBirthdays:birthdays,
  whatsappConsentAt:changed?now:(previous.whatsappConsentAt||null),whatsappConsentSource:changed?source:(previous.whatsappConsentSource||null)};
}
