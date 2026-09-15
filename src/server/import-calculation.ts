import { calculatePnL } from "@/lib/finance";
import { resolveQuoteToAccountConversion } from "@/lib/fx";
import { resolveInstrumentSpec } from "@/lib/instruments";
import type {
	ConversionSource,
	StoredTradeCalculation,
} from "./trade-calculation";

const EXTERNAL_WARNING =
	"P&L could not be calculated automatically because external currency conversion is required.";

type ImportedCalculationInput = {
	symbol: string;
	side: "LONG" | "SHORT";
	entryDate: Date;
	exitDate: Date | null;
	entryPrice: number;
	exitPrice: number | null;
	quantity: number;
	fees: number;
	accountCurrency: string;
	brokerNetPnl?: string;
};

type LocalLeg = {
	rate: number | null;
	source: ConversionSource | null;
	asOf: Date | null;
	externalRequired: boolean;
};

type ImportedCalculationResult = {
	snapshot: StoredTradeCalculation;
	netPnl: string | undefined;
	returnPercent?: string;
	warning?: string;
};

export function prepareImportedTradeCalculation(
	input: ImportedCalculationInput,
): ImportedCalculationResult {
	const instrument = resolveInstrumentSpec(input.symbol);
	const accountCurrency = input.accountCurrency.toUpperCase();
	const brokerReported = input.brokerNetPnl !== undefined;
	if (brokerReported) {
		return {
			netPnl: input.brokerNetPnl,
			snapshot: {
				quantityUnit: instrument.quantityUnit,
				contractSize: String(instrument.contractSize),
				baseCurrency: instrument.baseCurrency,
				quoteCurrency: instrument.quoteCurrency,
				pnlCurrency: accountCurrency,
				entryConversionRate: null,
				entryConversionSource: "BROKER_REPORTED",
				entryConversionAsOf: input.entryDate,
				exitConversionRate: null,
				exitConversionSource: "BROKER_REPORTED",
				exitConversionAsOf: input.exitDate,
			},
		};
	}

	function localLeg(price: number | null, at: Date | null): LocalLeg {
		if (price === null || at === null) {
			return { rate: null, source: null, asOf: null, externalRequired: false };
		}
		if (!Number.isFinite(price) || price <= 0) {
			return { rate: null, source: null, asOf: null, externalRequired: false };
		}
		if (!instrument.baseCurrency || !instrument.quoteCurrency) {
			return { rate: 1, source: "IDENTITY", asOf: at, externalRequired: false };
		}
		const resolution = resolveQuoteToAccountConversion({
			baseCurrency: instrument.baseCurrency,
			quoteCurrency: instrument.quoteCurrency,
			accountCurrency,
			instrumentPrice: price,
		});
		if (resolution.type === "EXTERNAL_REQUIRED") {
			return { rate: null, source: null, asOf: null, externalRequired: true };
		}
		return {
			rate: resolution.rate,
			source: resolution.type,
			asOf: at,
			externalRequired: false,
		};
	}

	const entry = localLeg(input.entryPrice, input.entryDate);
	const exit = localLeg(input.exitPrice, input.exitDate);
	const snapshot: StoredTradeCalculation = {
		quantityUnit: instrument.quantityUnit,
		contractSize: String(instrument.contractSize),
		baseCurrency: instrument.baseCurrency,
		quoteCurrency: instrument.quoteCurrency,
		pnlCurrency: accountCurrency,
		entryConversionRate: entry.rate === null ? null : String(entry.rate),
		entryConversionSource: entry.source,
		entryConversionAsOf: entry.asOf,
		exitConversionRate: exit.rate === null ? null : String(exit.rate),
		exitConversionSource: exit.source,
		exitConversionAsOf: exit.asOf,
	};

	if (entry.externalRequired || exit.externalRequired) {
		return { snapshot, netPnl: undefined, warning: EXTERNAL_WARNING };
	}
	if (input.exitPrice === null || !entry.rate || !exit.rate) {
		return { snapshot, netPnl: undefined };
	}

	const pnl = calculatePnL({
		side: input.side,
		entryPrice: input.entryPrice,
		exitPrice: input.exitPrice,
		quantity: input.quantity,
		contractSize: instrument.contractSize,
		entryQuoteToAccountRate: entry.rate,
		exitQuoteToAccountRate: exit.rate,
		feesAccount: input.fees,
	});
	return { snapshot, ...pnl };
}
