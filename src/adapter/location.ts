export interface Location {
	line: number;
	column?: number;
}

export interface UrlLocation extends Location {
	url?: string;
}

export interface LocationWithColumn extends Location {
	column: number;
}

export interface OriginalLocation extends LocationWithColumn {
	sourceIndex: number;
}

export interface MappedLocation extends LocationWithColumn {
	generated?: LocationWithColumn;
}

export interface Range {
	start: LocationWithColumn;
	end: LocationWithColumn;
}

export function isBefore(loc1: LocationWithColumn, loc2: LocationWithColumn) {
	if (loc1.line < loc2.line) {
		return true;
	} else if (loc1.line > loc2.line) {
		return false;
	} else {
		return (loc1.column ?? 0) < (loc2.column ?? 0);
	}
}

export function isInRange(loc: LocationWithColumn, range: Range) {
	return !isBefore(loc, range.start) && !isBefore(range.end, loc);
}
