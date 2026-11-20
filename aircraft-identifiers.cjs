'use strict';
// Shared browser/Node resolver for live ADS-B aircraft lookup.
// Airline ticket numbers use IATA's 2-character code; ADS-B broadcasts an
// operator's ICAO callsign, which may differ for codeshares and regional flights.
// See FAA ASQP carriers and IATA airline-code directories for these mappings.
const airlineCodes=Object.freeze({
 AA:'AAL',DL:'DAL',UA:'UAL',WN:'SWA',B6:'JBU',AS:'ASA',
 NK:'NKS',F9:'FFT',G4:'AAY',SY:'SCX',HA:'HAL',MX:'MXY',
 '9E':'EDV',OO:'SKW',MQ:'ENY',OH:'JIA',YX:'RPA',YV:'ASH',
 QX:'QXE',G7:'GJS',PT:'PDT',ZW:'AWI',C5:'UCA',
 FX:'FDX','5X':'UPS',PO:'PAC','5Y':'GTI',M6:'AJT',
 AC:'ACA',WS:'WJA',PD:'POE',TS:'TSC',AM:'AMX',Y4:'VOI',VB:'VIV',
 BA:'BAW',VS:'VIR',AF:'AFR',KL:'KLM',LH:'DLH',LX:'SWR',
 IB:'IBE',EI:'EIN',SK:'SAS',AY:'FIN',FI:'ICE',DY:'NOZ',
 D8:'IBK',FR:'RYR',U2:'EZY',W6:'WZZ',TK:'THY',
 EK:'UAE',QR:'QTR',EY:'ETD',SV:'SVA',MS:'MSR',ET:'ETH',
 QF:'QFA',NZ:'ANZ',JL:'JAL',NH:'ANA',CX:'CPA',SQ:'SIA',
 KE:'KAL',OZ:'AAR',BR:'EVA',CI:'CAL',PR:'PAL',AI:'AIC',
 TG:'THA',MH:'MAS',GA:'GIA',AK:'AXM',TR:'TGW',JQ:'JST',
 LA:'LAN',AV:'AVA',CM:'CMP',AD:'AZU',G3:'GLO',AR:'ARG',
 TP:'TAP',UX:'AEA',LO:'LOT',OS:'AUA',SN:'BEL',A3:'AEE',
 LY:'ELY',CA:'CCA',MU:'CES',CZ:'CSN',MF:'CXA'
});
function resolveAircraftIdentifier(raw){
 const input=String(raw??'').trim().toUpperCase();
 const invalid=error=>({input,lookup:null,kind:null,error});
 if(!/^[A-Z0-9]+(?:-[A-Z0-9]+)?$/.test(input)||input.length<2||input.length>12)
  return invalid('Enter a valid aircraft tail number or airline flight number.');
 // A registration takes precedence over a guessed airline code.
 if(/^N[1-9][0-9]{0,4}[A-Z]{0,2}$/.test(input) && input.length<=6)
  return {input,lookup:input,kind:'registration',error:null};
 if(/^[A-Z0-9]{1,3}-[A-Z0-9]{2,5}$/.test(input))
  return {input,lookup:input,kind:'registration',error:null};
 const icao=input.match(/^([A-Z]{3})([0-9]{1,5}[A-Z]?)$/);
 if(icao)return {input,lookup:input,kind:'callsign',error:null};
 const ticket=input.match(/^([A-Z0-9]{2})([0-9]{1,5}[A-Z]?)$/);
 if(ticket){
  const operator=ticket[1]==='SW'?'SWA':airlineCodes[ticket[1]];
  if(!operator)return invalid('Unknown two-character airline code '+ticket[1]+'. Enter the operator’s three-letter ICAO callsign or aircraft tail number.');
  return {input,lookup:operator+ticket[2],kind:'callsign',error:null};
 }
 if(/^[A-Z]{1,3}[A-Z0-9]{2,8}$/.test(input))
  return {input,lookup:input,kind:'registration',error:null};
 return invalid('Enter a tail number such as N123AB or a flight number such as DL3475.');
}
const AircraftIdentifiers=Object.freeze({airlineCodes,resolveAircraftIdentifier});
if(typeof module!=='undefined'&&module.exports)module.exports=AircraftIdentifiers;
if(typeof window!=='undefined')window.AircraftIdentifiers=AircraftIdentifiers;
