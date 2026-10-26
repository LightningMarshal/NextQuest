import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateAppSettings } from "@/server/settings-actions";
import type { AppSettings } from "@/server/settings";

export function SettingsForm({ settings }: { settings: AppSettings }) {
	return (
		<ActionForm action={updateAppSettings} formClassName="flex flex-col gap-4" block>
			<div className="flex max-w-sm flex-col gap-1.5">
				<Label htmlFor="settings-group-name">Group name</Label>
				<Input id="settings-group-name" name="groupName" required maxLength={50} defaultValue={settings.groupName} />
			</div>
			<label className="flex items-start gap-2 text-sm">
				<input
					type="checkbox"
					name="showCompletionStats"
					value="1"
					defaultChecked={settings.showCompletionStats}
					className="accent-primary mt-0.5 size-4"
				/>
				<span>
					Show the legacy burn-rate on Stats
					<span className="text-muted-foreground block text-xs">
						Historical effort points are frozen; the chart shows what the group burned down before the redesign.
					</span>
				</span>
			</label>
			<Button className="self-start">Save settings</Button>
		</ActionForm>
	);
}
